#!/usr/bin/env node

/**
 * untis2mqtt — WebUntis school timetables -> MQTT, mqtt-smarthome convention, on
 * mqtt-interfaces-core.
 *
 * Wiring only: the WebUntis sessions (lib/untis.js, one per account) fetch, the timetable model
 * (lib/timetable.js) shapes, the item table (lib/items.js) names, and this file publishes — on a
 * schedule (lib/schedule.js) for the fetch and once a minute, without a fetch, for the items that
 * move with the clock (in_school, now, next_lesson, the next school day).
 */

import {createAdapter, createLogger} from 'mqtt-interfaces-core';

import config, {GROUPS} from './config.js';
import pkg from './package.json' with {type: 'json'};
import {loadAccounts} from './lib/accounts.js';
import {handle as handleInstall} from './lib/install.js';
import {allItems, childItems, extraItems, parseGroups, schoolItems, weekItems} from './lib/items.js';
import {
    homeworkRange,
    parseAbsences,
    parseExams,
    parseHomework,
    parseMessages,
    parseNews,
    schoolCalendar,
} from './lib/extras.js';
import {childNames, parseNicknames} from './lib/names.js';
import {pollDelay} from './lib/schedule.js';
import {addDays, buildTimetable, localNow} from './lib/timetable.js';
import {createSession, isAuthError, searchSchools, splitStudentName, timetableLastName} from './lib/untis.js';

/*
 * --discover: Untis' school list, searched by the text in --school. Printed here rather than by
 * the core's runDiscovery, which keys candidates by address: many schools share one WebUntis
 * server, and merging them by server would drop all but one.
 */
if (config.discover) {
    const log = createLogger({envPrefix: config.$envPrefix, level: config.verbosity});
    try {
        const schools = await searchSchools(config.school);
        if (config.discoverJson) {
            console.log(
                JSON.stringify(
                    schools.map((s) => ({address: s.server, school: s.school, name: s.name, location: s.address})),
                    null,
                    2,
                ),
            );
        } else if (schools.length === 0) {
            console.log('nothing found');
        } else {
            for (const s of schools) {
                console.log(`${s.server}  --school ${s.school}  ${s.name}  (${s.address})`);
            }
        }
        process.exit(0);
    } catch (error) {
        log.error(`--discover: ${error.message}`);
        process.exit(1);
    }
}

handleInstall(config); // --install / --uninstall never reach the rest

const MINUTE = 60 * 1000;
const timeZone = config.timezone;

/** the WebUntis sessions, one per account */
let sessions = [];
/** the children of all accounts: {id, item, label, session, timeGrid, holidays} */
let children = [];
/** child id → the timetable of the fetched range (lib/timetable.js) */
const timetables = new Map();
/** child id → {homework, absences, messages, exams}, each once fetched */
const extras = new Map();
/** school-wide: {calendar, news} */
const school = {};
/** `<account>:<endpoint>` the school refuses (403) — asked once per run, then left alone */
const refused = new Set();
let pollTimer = null;
let polling = false;
let firstPublish = true;

const adapter = createAdapter({
    pkg,
    config,
    deviceLabel: 'webuntis',
    // what a previous run left retained is read back, so items of a child or a group that is gone get cleared
    readback: true,
    info: () => ({
        server: config.server,
        school: config.school,
        accounts: sessions.length,
        children: children.map((c) => ({id: c.id, item: c.item})),
    }),
    onSet: handleSet,
    onShutdown: () => {
        clearTimeout(pollTimer);
        return Promise.all(sessions.map((s) => s.logout()));
    },
});
const {log, pubStatus, clearStatus, setDeviceConnected} = adapter;

let accounts;
try {
    accounts = loadAccounts(config);
} catch (error) {
    log.error(error.message);
    process.exit(1);
}

const {nicknames, invalid} = parseNicknames(config.child);
for (const entry of invalid) {
    log.warn(`ignoring --child ${entry}: expected <student id>=<nickname>`);
}
const {groups, unknown} = parseGroups(config.publish, GROUPS);
for (const name of unknown) {
    log.warn(`ignoring --publish ${name}: known groups are ${GROUPS.join(', ')}`);
}

sessions = accounts.map((account) => createSession({server: config.server, school: config.school, ...account, log}));

async function handleSet(parts) {
    switch (parts.join('/')) {
        case 'refresh':
            return poll();
        default:
            throw new Error('unknown item ' + parts.join('/'));
    }
}

const today = () => localNow(Date.now(), timeZone).date;

/** log in everywhere and collect the children; a child two accounts can see is counted once */
async function discoverChildren() {
    const found = new Map();
    for (const session of sessions) {
        const data = await session.appData();
        for (const child of data.children) {
            if (found.has(child.id)) {
                continue;
            }
            const lastName = timetableLastName(await session.timetable(child.id, today(), today()));
            found.set(child.id, {
                ...child,
                ...splitStudentName(child.displayName, lastName),
                session,
                timeGrid: data.timeGrid,
                holidays: data.holidays,
                schoolYear: data.schoolYear,
            });
        }
    }
    children = childNames([...found.values()], config.childNames, nicknames);
    for (const child of children) {
        // ids and item names only — real names reach the log only when they are the item name
        log.info(`child ${child.id} → ${config.name}/status/${child.item}`);
    }
    adapter.publishInfo();
}

/** publish only what changed: the minute tick recomputes everything */
function publishItems(items) {
    for (const [item, value] of Object.entries(items)) {
        if (JSON.stringify(adapter.get(item)) !== JSON.stringify(value) || adapter.get(item) === undefined) {
            pubStatus(item, value);
        }
    }
}

/** recompute and publish all items from the fetched timetables (no WebUntis request) */
function publishAll() {
    const now = Date.now();
    const slots = [];
    for (const child of children) {
        const timetable = timetables.get(child.id);
        if (!timetable) {
            continue;
        }
        const result = childItems(child.item, timetable, now, {timeZone, groups});
        publishItems(result.items);
        publishItems(weekItems(child.item, timetable, now, {timeZone, groups}));
        slots.push(result.slots);
    }
    publishItems(allItems(slots, {groups}));
    const day = today();
    const tomorrow = addDays(day, 1);
    for (const child of children) {
        const items = extraItems(child.item, extras.get(child.id) || {}, {
            timetable: timetables.get(child.id),
            now,
            today: day,
            tomorrow,
            groups,
        });
        publishItems(items);
    }
    publishItems(schoolItems(school, {groups}));
}

/**
 * One optional endpoint: its result, or undefined when the school refuses it (asked once, logged
 * once) or it failed this time (the previous result stays published).
 */
async function optional(session, endpoint, call) {
    const key = `${session.username}:${endpoint}`;
    if (refused.has(key)) {
        return undefined;
    }
    try {
        return await call();
    } catch (error) {
        if (error.code === 'FORBIDDEN') {
            refused.add(key);
            log.info(`${endpoint}: not available for this account (${error.message})`);
        } else if (isAuthError(error)) {
            throw error;
        } else {
            log.warn(`${endpoint}: ${error.message}`);
        }
        return undefined;
    }
}

/** homework, absences, messages and exams per child, the calendar and messages of the day once */
async function fetchExtras(start, end) {
    const perSession = new Map();
    for (const session of new Set(children.map((c) => c.session))) {
        const range = homeworkRange(start, Number(config.days) || 14);
        const fetched = {};
        if (groups.has('homework')) {
            const data = await optional(session, 'homework', () => session.homework(range.start, range.end));
            fetched.homework = data && parseHomework(data);
        }
        if (groups.has('messages')) {
            const data = await optional(session, 'messages', () => session.messages());
            fetched.messages = data && parseMessages(data, timeZone);
        }
        perSession.set(session, fetched);
    }
    for (const child of children) {
        const own = {...perSession.get(child.session)};
        const previous = extras.get(child.id) || {};
        if (groups.has('absences')) {
            const from = child.schoolYear?.start || addDays(start, -365);
            const data = await optional(child.session, 'absences', () => child.session.absences(child.id, from, start));
            own.absences = data && parseAbsences(data, timeZone);
        }
        if (groups.has('exams')) {
            const data = await optional(child.session, 'exams', () => child.session.exams(child.id, start, end));
            own.exams = data ? parseExams(data, timeZone) : undefined;
        }
        // a failed fetch keeps what was published before
        extras.set(
            child.id,
            Object.fromEntries(Object.keys({...previous, ...own}).map((k) => [k, own[k] ?? previous[k]])),
        );
    }
    if (groups.has('school') && children[0]) {
        const first = children[0];
        school.calendar = schoolCalendar(
            {schoolYear: first.schoolYear, timeGrid: first.timeGrid, holidays: first.holidays},
            start,
        );
        const data = await optional(first.session, 'news', () => first.session.news(start));
        school.news = data ? parseNews(data) : school.news;
    }
}

async function poll() {
    if (polling) {
        return;
    }
    polling = true;
    try {
        if (children.length === 0) {
            await discoverChildren();
        }
        const start = today();
        // at least three weeks: the week of the next school day and the one after it
        const end = addDays(start, Math.max(21, Number(config.days) || 14));
        for (const child of children) {
            const days = await child.session.timetable(child.id, start, end);
            timetables.set(
                child.id,
                buildTimetable(days, {timeGrid: child.timeGrid, holidays: child.holidays, timeZone}),
            );
            pubStatus(`${child.item}/last_update`, new Date().toISOString());
        }
        await fetchExtras(start, end);
        publishAll();
        setDeviceConnected(true);
        if (firstPublish) {
            firstPublish = false;
            await clearLeftovers();
        }
    } catch (error) {
        setDeviceConnected(false);
        if (isAuthError(error)) {
            log.error(`webuntis: ${error.message}`);
        } else {
            log.warn(`webuntis: ${error.message}`);
        }
    } finally {
        polling = false;
        schedulePoll();
    }
}

/** items a previous run published that this one does not (a renamed child, a group switched off) */
async function clearLeftovers() {
    await adapter.readbackDone();
    for (const item of adapter.staleStatus()) {
        log.info(`clearing ${config.name}/status/${item}, not published any more`);
        clearStatus(item);
    }
}

function schedulePoll() {
    clearTimeout(pollTimer);
    const todaySummary = children.map((c) => timetables.get(c.id)?.get(today())?.summary).filter(Boolean);
    const delay = pollDelay(Date.now(), {
        timeZone,
        interval: config.pollInterval,
        morning: config.pollIntervalMorning,
        night: config.pollIntervalNight,
        schoolToday: todaySummary.length === 0 || todaySummary.some((s) => s.school),
    });
    pollTimer = setTimeout(poll, delay);
    log.debug(`next fetch in ${Math.round(delay / 1000)} s`);
}

/** the clock moves in_school, now, next_lesson and the next school day; aligned to the minute */
function startMinuteTick() {
    const tick = () => {
        if (timetables.size > 0) {
            publishAll();
        }
    };
    setTimeout(
        () => {
            tick();
            setInterval(tick, MINUTE).unref();
        },
        MINUTE - (Date.now() % MINUTE) + 500,
    ).unref();
}

adapter.start();
startMinuteTick();
poll();
