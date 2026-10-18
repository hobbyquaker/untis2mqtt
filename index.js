#!/usr/bin/env node

/**
 * untis2mqtt — WebUntis school timetables -> MQTT, mqtt-smarthome convention, on
 * mqtt-interfaces-core.
 *
 * So far: the WebUntis sessions (one per account), the children of all accounts and their names.
 * The timetable model, the items, the alerts and the HTML output follow.
 */

import {createAdapter, createLogger} from 'mqtt-interfaces-core';

import config from './config.js';
import pkg from './package.json' with {type: 'json'};
import {loadAccounts} from './lib/accounts.js';
import {handle as handleInstall} from './lib/install.js';
import {childNames, parseNicknames} from './lib/names.js';
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

const adapter = createAdapter({
    pkg,
    config,
    deviceLabel: 'webuntis',
    info: () => ({server: config.server, school: config.school, accounts: sessions.length, children: children.length}),
    onSet: handleSet,
    onShutdown: () => Promise.all(sessions.map((s) => s.logout())),
});
const {log, setDeviceConnected} = adapter;

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

const sessions = accounts.map((account) =>
    createSession({server: config.server, school: config.school, ...account, log}),
);
/** the children of all accounts, each with the session that may read it and its item name */
let children = [];

async function handleSet(parts) {
    switch (parts.join('/')) {
        case 'refresh':
            return poll();
        default:
            throw new Error('unknown item ' + parts.join('/'));
    }
}

/** log in everywhere and collect the children; a child two accounts can see is counted once */
async function discoverChildren() {
    const found = new Map();
    for (const session of sessions) {
        const data = await session.appData();
        const today = new Date().toISOString().slice(0, 10);
        for (const child of data.children) {
            if (!found.has(child.id)) {
                const lastName = timetableLastName(await session.timetable(child.id, today, today));
                found.set(child.id, {...child, ...splitStudentName(child.displayName, lastName), session});
            }
        }
    }
    children = childNames([...found.values()], config.childNames, nicknames);
    for (const child of children) {
        // ids and item names only — real names stay out of the log unless they are the item name
        log.info(`child ${child.id} → ${config.name}/status/${child.item}`);
    }
}

async function poll() {
    try {
        if (children.length === 0) {
            await discoverChildren();
        }
        const today = new Date().toISOString().slice(0, 10);
        for (const child of children) {
            const days = await child.session.timetable(child.id, today, today);
            const lessons = days.flatMap((d) => d.gridEntries || []).length;
            log.debug(`${child.item}: ${lessons} lessons today`);
        }
        setDeviceConnected(true);
    } catch (error) {
        setDeviceConnected(false);
        if (isAuthError(error)) {
            log.error(`webuntis: ${error.message}`);
        } else {
            log.warn(`webuntis: ${error.message}`);
        }
    }
}

adapter.start();
poll();
