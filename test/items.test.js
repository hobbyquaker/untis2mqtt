import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describe, test} from 'node:test';

import {allItems, childItems, parseGroups} from '../lib/items.js';
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
