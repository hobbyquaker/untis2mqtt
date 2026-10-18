/**
 * The status items — pure. The timetable model (lib/timetable.js) in, `{item: value}` out; index.js
 * publishes them. Values are machine-readable: ISO 8601 times with the school's offset, ISO dates,
 * numbers, booleans, lesson objects; `null` where there is nothing (no first lesson on a day off).
 */

import {examsFromTimetable} from './extras.js';
import {
    addDays,
    combineSummaries,
    currentLesson,
    daySlots,
    inSchool,
    localNow,
    nextLesson,
    summarizeDay,
    weekStart,
} from './timetable.js';

export const SLOTS = ['today', 'tomorrow', 'next'];
const SUMMARY_FIELDS = ['date', 'school', 'start', 'end', 'start_planned', 'end_planned', 'lessons', 'changes'];

/** a summary for a slot without a day (no school day within the fetched range) */
const NO_DAY = {
    date: null,
    school: false,
    start: null,
    end: null,
    start_planned: null,
    end_planned: null,
    lessons: 0,
    changes: 0,
};

/**
 * One child's items.
 *
 * @param {string} prefix the child's item name (`student_123`, a nickname …)
 * @param {Map} timetable from buildTimetable
 * @param {number} now ms
 * @param {{timeZone: string, groups: Set<string>}} options `groups`: the `--publish` groups
 * @returns {{items: Record<string, *>, slots: Record<string, object|null>}} the slots' summaries for `all/…`
 */
export function childItems(prefix, timetable, now, {timeZone, groups}) {
    const items = {};
    const slots = daySlots(timetable, now, timeZone);
    const summaries = {};
    for (const slot of SLOTS) {
        const day = slots[slot];
        const summary = day ? day.summary : NO_DAY;
        summaries[slot] = day ? day.summary : null;
        if (groups.has('day')) {
            for (const field of SUMMARY_FIELDS) {
                items[`${prefix}/${slot}/${field}`] = summary[field];
            }
        }
        if (groups.has('timetable')) {
            items[`${prefix}/${slot}/timetable`] = day ? day.lessons : [];
        }
    }
    if (groups.has('live')) {
        items[`${prefix}/in_school`] = inSchool(slots.today.summary, now);
        items[`${prefix}/now`] = currentLesson(timetable, now);
        items[`${prefix}/next_lesson`] = nextLesson(timetable, now);
    }
    return {items, slots: summaries};
}

/**
 * `all/<slot>/…` across the children — the household's earliest start and latest end. Only with
 * more than one child; for one child it would repeat its own items.
 *
 * @param {Array<Record<string, object|null>>} slotsPerChild the `slots` of childItems()
 */
export function allItems(slotsPerChild, {groups}) {
    const items = {};
    if (slotsPerChild.length < 2 || !groups.has('day')) {
        return items;
    }
    for (const slot of SLOTS) {
        const summary = combineSummaries(slotsPerChild.map((s) => s[slot]));
        const merged = summary.date === null ? NO_DAY : summary;
        for (const field of SUMMARY_FIELDS) {
            items[`all/${slot}/${field}`] = merged[field];
        }
    }
    return items;
}

/** `--publish` → a Set; unknown names are returned to be warned about */
export function parseGroups(list, known) {
    const groups = new Set();
    const unknown = [];
    for (const name of [].concat(list || []).flatMap((s) => String(s).split(/[,\s]+/))) {
        if (!name) {
            continue;
        }
        if (known.includes(name)) {
            groups.add(name);
        } else {
            unknown.push(name);
        }
    }
    return {groups, unknown};
}

/**
 * A child's items besides the timetable. Each kind is published only once it was fetched — an
 * endpoint the school refuses leaves its items out rather than publishing an empty list as if
 * there were nothing.
 *
 * @param {string} prefix the child's item name
 * @param {{homework?: Array, absences?: Array, messages?: Array, exams?: Array}} extras what was fetched
 * @param {{timetable?: Map, now: number, today: string, tomorrow: string, groups: Set<string>}} options
 */
export function extraItems(prefix, extras, {timetable, now, today, tomorrow, groups}) {
    const items = {};
    if (groups.has('homework') && extras.homework) {
        const open = extras.homework.filter((h) => !h.completed && h.due >= today);
        items[`${prefix}/homework`] = extras.homework;
        items[`${prefix}/homework/open`] = open.length;
        items[`${prefix}/homework/due_tomorrow`] = open.filter((h) => h.due === tomorrow).length;
    }
    if (groups.has('exams')) {
        const fromTimetable = timetable ? examsFromTimetable(timetable) : [];
        const all = [...(extras.exams || []), ...fromTimetable].sort((a, b) => a.start.localeCompare(b.start));
        items[`${prefix}/exams`] = all;
        items[`${prefix}/exams/next`] = all.find((e) => Date.parse(e.end) > now) || null;
    }
    if (groups.has('absences') && extras.absences) {
        items[`${prefix}/absences`] = extras.absences;
        items[`${prefix}/absences/count`] = extras.absences.length;
        items[`${prefix}/absences/unexcused`] = extras.absences.filter((a) => !a.excused).length;
    }
    if (groups.has('messages') && extras.messages) {
        items[`${prefix}/messages`] = extras.messages;
        items[`${prefix}/messages/unread`] = extras.messages.filter((m) => !m.read).length;
    }
    return items;
}

/** school-wide items: the school year, the time grid, the holidays to come, the messages of the day */
export function schoolItems({calendar, news}, {groups}) {
    const items = {};
    if (!groups.has('school')) {
        return items;
    }
    if (calendar) {
        items['school/school_year'] = calendar.school_year;
        items['school/time_grid'] = calendar.time_grid;
        items['school/holidays'] = calendar.holidays;
    }
    if (news) {
        items['school/news'] = news;
    }
    return items;
}

/**
 * One week for a dashboard: the Monday, and Monday to Friday — Saturday and Sunday only when they
 * have lessons — each day with its summary and its lessons.
 */
export function week(timetable, monday) {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = addDays(monday, i);
        const day = timetable.get(date);
        if (i >= 5 && !(day && day.lessons.length > 0)) {
            continue;
        }
        const summary = day ? day.summary : summarizeDay(date, []);
        days.push({...summary, timetable: day ? day.lessons : []});
    }
    return {monday, days};
}

/**
 * `<child>/week` — the week of the next school day, so after Friday's last lesson the following one —
 * and `<child>/week/next`, the week after. Without a school day in range: this calendar week.
 */
export function weekItems(prefix, timetable, now, {timeZone, groups}) {
    if (!groups.has('week')) {
        return {};
    }
    const {next} = daySlots(timetable, now, timeZone);
    const monday = weekStart(next ? next.summary.date : localNow(now, timeZone).date);
    return {
        [`${prefix}/week`]: week(timetable, monday),
        [`${prefix}/week/next`]: week(timetable, addDays(monday, 7)),
    };
}
