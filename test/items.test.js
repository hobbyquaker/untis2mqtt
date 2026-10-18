import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describe, test} from 'node:test';

import {allItems, childItems, parseGroups, weekItems} from '../lib/items.js';
import {buildTimetable} from '../lib/timetable.js';
import {parseAppData} from '../lib/untis.js';

const TZ = 'Europe/Berlin';
const read = (name) => JSON.parse(readFileSync(new URL(`fixtures/webuntis/${name}`, import.meta.url), 'utf8'));
const {timeGrid} = parseAppData(read('account-a-appdata.json'));
const ttA = buildTimetable(read('account-a-timetable.json').days, {timeGrid, timeZone: TZ});
const ttB = buildTimetable(read('account-b-timetable.json').days, {timeGrid, timeZone: TZ});
const ALL = new Set(['day', 'live', 'timetable']);
const monday8 = Date.parse('2026-10-19T08:00:00+02:00');

describe('items', () => {
    test('day items per slot, ISO values', () => {
        const {items} = childItems('max', ttA, monday8, {timeZone: TZ, groups: ALL});
        assert.equal(items['max/today/date'], '2026-10-19');
        assert.equal(items['max/today/school'], true);
        assert.match(items['max/today/start'], /^2026-10-19T\d\d:\d\d:00\+02:00$/);
        assert.equal(items['max/tomorrow/date'], '2026-10-20');
        assert.equal(items['max/next/date'], '2026-10-19');
        assert.equal(items['max/today/lessons'], 3);
        assert.equal(items['max/today/changes'], 0);
        assert.equal(items['max/today/timetable'].length, 3);
        assert.equal(items['max/today/timetable'][0].start, items['max/today/start']);
    });

    test('live items', () => {
        const {items} = childItems('max', ttA, monday8, {timeZone: TZ, groups: ALL});
        assert.equal(typeof items['max/in_school'], 'boolean');
        assert.ok('max/now' in items);
        assert.ok(items['max/next_lesson'] === null || items['max/next_lesson'].start > '2026-10-19T08:00');
    });

    test('no school day ahead: next is empty, not missing', () => {
        const afterLast = Date.parse(ttA.get('2026-10-23').summary.end) + 60000;
        const {items} = childItems('max', ttA, afterLast, {timeZone: TZ, groups: ALL});
        assert.equal(items['max/next/date'], null);
        assert.equal(items['max/next/school'], false);
        assert.equal(items['max/next/start'], null);
        assert.equal(items['max/next/lessons'], 0);
        assert.deepEqual(items['max/next/timetable'], []);
        assert.equal(items['max/tomorrow/school'], false);
    });

    test('groups switch items off', () => {
        const {items} = childItems('max', ttA, monday8, {timeZone: TZ, groups: new Set(['day'])});
        assert.ok('max/today/start' in items);
        assert.ok(!('max/today/timetable' in items));
        assert.ok(!('max/in_school' in items));
    });

    test('all/… only with more than one child', () => {
        const a = childItems('a', ttA, monday8, {timeZone: TZ, groups: ALL});
        const b = childItems('b', ttB, monday8, {timeZone: TZ, groups: ALL});
        assert.deepEqual(allItems([a.slots], {groups: ALL}), {});
        const all = allItems([a.slots, b.slots], {groups: ALL});
        assert.equal(all['all/today/school'], true);
        const starts = [a.items['a/today/start'], b.items['b/today/start']].sort();
        assert.equal(all['all/today/start'], starts[0]);
        assert.equal(all['all/today/lessons'], a.items['a/today/lessons'] + b.items['b/today/lessons']);
    });

    test('--publish groups', () => {
        const {groups, unknown} = parseGroups(['day,live', 'html', 'nope'], ['day', 'live', 'html']);
        assert.deepEqual([...groups], ['day', 'live', 'html']);
        assert.deepEqual(unknown, ['nope']);
    });
});

describe('week', () => {
    const groups = new Set(['week']);

    test('the week of the next school day, Monday to Friday', () => {
        const items = weekItems('max', ttA, monday8, {timeZone: TZ, groups});
        const w = items['max/week'];
        assert.equal(w.monday, '2026-10-19');
        assert.deepEqual(
            w.days.map((d) => d.date),
            ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'],
        );
        assert.equal(w.days[0].timetable.length, w.days[0].lessons);
        assert.equal(w.days[0].school, true);
        const n = items['max/week/next'];
        assert.equal(n.monday, '2026-10-26');
        assert.ok(n.days.every((d) => d.school === false));
    });

    test("after Friday's last lesson the following week", () => {
        const afterFriday = Date.parse(ttA.get('2026-10-16').summary.end) + 60000;
        const items = weekItems('max', ttA, afterFriday, {timeZone: TZ, groups});
        assert.equal(items['max/week'].monday, '2026-10-19');
        assert.equal(items['max/week/next'].monday, '2026-10-26');
    });

    test('no school day ahead: this calendar week', () => {
        const afterLast = Date.parse(ttA.get('2026-10-23').summary.end) + 60000;
        assert.equal(weekItems('max', ttA, afterLast, {timeZone: TZ, groups})['max/week'].monday, '2026-10-19');
    });

    test('a Saturday with lessons is part of the week', () => {
        const days = structuredClone(read('account-a-timetable.json').days);
        const saturday = days.find((d) => d.date.startsWith('2026-10-24'));
        saturday.gridEntries = [structuredClone(days.find((d) => d.date.startsWith('2026-10-23')).gridEntries[0])];
        saturday.gridEntries[0].duration = {start: '2026-10-24T08:30', end: '2026-10-24T09:15'};
        const tt = buildTimetable(days, {timeGrid, timeZone: TZ});
        const w = weekItems('max', tt, monday8, {timeZone: TZ, groups})['max/week'];
        assert.equal(w.days.at(-1).date, '2026-10-24');
    });

    test('switched off with --publish', () => {
        assert.deepEqual(weekItems('max', ttA, monday8, {timeZone: TZ, groups: new Set()}), {});
    });
});
