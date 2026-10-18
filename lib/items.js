/**
 * The status items — pure. The timetable model (lib/timetable.js) in, `{item: value}` out; index.js
 * publishes them. Values are machine-readable: ISO 8601 times with the school's offset, ISO dates,
 * numbers, booleans, lesson objects; `null` where there is nothing (no first lesson on a day off).
 */

import {combineSummaries, currentLesson, daySlots, inSchool, nextLesson} from './timetable.js';

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
