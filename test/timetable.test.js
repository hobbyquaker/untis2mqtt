import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describe, test} from 'node:test';

import {
    addDays,
    buildTimetable,
    combineSummaries,
    currentLesson,
    daySlots,
    holidayOn,
    inSchool,
    localIso,
    localNow,
    nextLesson,
    parseLesson,
    summarizeDay,
} from '../lib/timetable.js';
import {parseAppData} from '../lib/untis.js';

const TZ = 'Europe/Berlin';
const read = (name) => JSON.parse(readFileSync(new URL(`fixtures/webuntis/${name}`, import.meta.url), 'utf8'));
const {timeGrid} = parseAppData(read('account-a-appdata.json'));
const daysA = read('account-a-timetable.json').days;
const daysB = read('account-b-timetable.json').days;
const entriesOn = (days, date) => days.find((d) => d.date.startsWith(date)).gridEntries;
const at = (iso) => Date.parse(iso);
/** a deep copy of the fixture days with `edit(entries)` applied to one date */
function editDay(days, date, edit) {
    const copy = structuredClone(days);
    edit(entriesOn(copy, date));
    return copy;
}

describe('time', () => {
    test('local school time → ISO with the offset of that day', () => {
        assert.equal(localIso('2026-10-19T07:40', TZ), '2026-10-19T07:40:00+02:00');
        assert.equal(localIso('2026-11-09T07:40', TZ), '2026-11-09T07:40:00+01:00');
        // the night of the change back to winter time, and the summer one
        assert.equal(localIso('2026-10-25T12:00', TZ), '2026-10-25T12:00:00+01:00');
        assert.equal(localIso('2026-03-29T12:00', TZ), '2026-03-29T12:00:00+02:00');
        assert.equal(localIso('2026-10-19T07:40', 'UTC'), '2026-10-19T07:40:00+00:00');
    });

    test('dates', () => {
        assert.equal(addDays('2026-10-31', 1), '2026-11-01');
        assert.deepEqual(localNow(at('2026-10-18T22:30:00Z'), TZ), {date: '2026-10-19', time: '00:30'});
    });
});

describe('lessons', () => {
    test('a regular lesson', () => {
        const lesson = parseLesson(entriesOn(daysA, '2026-10-12')[0], {timeGrid, timeZone: TZ});
        assert.equal(lesson.date, '2026-10-12');
        assert.match(lesson.start, /^2026-10-12T\d\d:\d\d:00\+02:00$/);
        assert.equal(lesson.status, 'regular');
        assert.deepEqual(lesson.changes, {});
        assert.match(lesson.subject, /^F\d+$/);
        assert.equal(lesson.teacher.length, 1);
    });

    test('a double lesson covers two periods', () => {
        const double = entriesOn(daysA, '2026-10-20').find((e) => e.duration.start.endsWith('07:40'));
        const lesson = parseLesson(double, {timeGrid, timeZone: TZ});
        assert.equal(lesson.end, '2026-10-20T09:15:00+02:00');
        assert.deepEqual(lesson.periods, [1, 2]);
        assert.equal(lesson.period, 1);
    });

    test('a substitution with a room change', () => {
        const entry = entriesOn(daysA, '2026-10-14').find((e) => e.status === 'CHANGED');
        const lesson = parseLesson(entry, {timeGrid, timeZone: TZ});
        assert.equal(lesson.status, 'changed');
        assert.deepEqual(lesson.changes, {
            teacher: {from: ['T6'], to: ['T15']},
            room: {from: ['R5'], to: ['R1']},
        });
        assert.deepEqual(lesson.teacher, ['T15']);
    });

    test('an extra lesson with a substitution text', () => {
        const entry = entriesOn(daysA, '2026-10-20').find((e) => e.type === 'ADDITIONAL_PERIOD');
        const lesson = parseLesson(entry, {timeGrid, timeZone: TZ});
        assert.equal(lesson.status, 'additional');
        assert.equal(lesson.text, 'text 5');
        assert.deepEqual(lesson.changes.room, {from: ['R7'], to: ['R1']});
    });

    test('an event: several teachers and classes, the info element as text', () => {
        const entry = entriesOn(daysB, '2026-10-22').find((e) => e.type === 'EVENT');
        const lesson = parseLesson(entry, {timeGrid, timeZone: TZ});
        assert.equal(lesson.status, 'event');
        assert.equal(lesson.teacher.length, 3);
        assert.equal(lesson.class.length, 2);
        assert.match(lesson.info, /text 20/);
        assert.deepEqual(lesson.periods, [4, 5, 6]);
    });

    test('cancelled and moved', () => {
        const [entry] = entriesOn(daysA, '2026-10-19');
        assert.equal(parseLesson({...entry, status: 'CANCELLED'}, {timeGrid, timeZone: TZ}).status, 'cancelled');
        const moved = parseLesson({...entry, statusDetail: 'MOVED'}, {timeGrid, timeZone: TZ});
        assert.equal(moved.moved, true);
        assert.equal(moved.status, 'regular');
    });
});

describe('days', () => {
    const tt = buildTimetable(daysA, {timeGrid, timeZone: TZ});

    test('a regular day', () => {
        const {lessons, summary} = tt.get('2026-10-19');
        assert.equal(lessons.length, 3);
        assert.equal(summary.school, true);
        assert.equal(summary.lessons, 3);
        assert.equal(summary.start, lessons[0].start);
        assert.equal(summary.start, summary.start_planned);
        assert.equal(summary.end, summary.end_planned);
        assert.equal(summary.changes, 0);
        assert.ok(lessons.every((l, i) => i === 0 || lessons[i - 1].start <= l.start));
    });

    test('a weekend and the holidays: no school', () => {
        assert.equal(tt.get('2026-10-17').summary.school, false);
        assert.equal(tt.get('2026-10-27').summary.school, false);
        assert.equal(tt.get('2026-10-27').summary.start, null);
    });

    test('a cancelled first lesson: start later than planned', () => {
        const days = editDay(daysA, '2026-10-19', (entries) => {
            entries.sort((a, b) => a.duration.start.localeCompare(b.duration.start))[0].status = 'CANCELLED';
        });
        const {summary} = buildTimetable(days, {timeGrid, timeZone: TZ}).get('2026-10-19');
        assert.equal(summary.lessons, 2);
        assert.equal(summary.changes, 1);
        assert.ok(Date.parse(summary.start) > Date.parse(summary.start_planned));
        assert.equal(summary.end, summary.end_planned);
    });

    test('everything cancelled: no school, the plan stays visible', () => {
        const days = editDay(daysA, '2026-10-19', (entries) => entries.forEach((e) => (e.status = 'CANCELLED')));
        const {summary} = buildTimetable(days, {timeGrid, timeZone: TZ}).get('2026-10-19');
        assert.equal(summary.school, false);
        assert.equal(summary.start, null);
        assert.notEqual(summary.start_planned, null);
    });

    test('an extra lesson counts for start, not for the plan', () => {
        const {summary} = tt.get('2026-10-20');
        assert.equal(summary.start, '2026-10-20T07:40:00+02:00');
        assert.ok(summary.changes >= 1);
    });

    test('holidays by date', () => {
        const holidays = [{name: 'Herbstferien', start: '2026-10-26', end: '2026-10-31'}];
        assert.equal(holidayOn('2026-10-27', holidays).name, 'Herbstferien');
        assert.equal(holidayOn('2026-11-02', holidays), null);
        assert.equal(summarizeDay('2026-10-27', [], {holidays}).holiday, 'Herbstferien');
    });
});

describe('slots and live', () => {
    const tt = buildTimetable(daysA, {timeGrid, timeZone: TZ});

    test('during a school day: next is today', () => {
        const slots = daySlots(tt, at('2026-10-19T08:00:00+02:00'), TZ);
        assert.equal(slots.today.summary.date, '2026-10-19');
        assert.equal(slots.tomorrow.summary.date, '2026-10-20');
        assert.equal(slots.next.summary.date, '2026-10-19');
    });

    test('after the last lesson on Friday: next skips the weekend', () => {
        const end = tt.get('2026-10-16').summary.end;
        const slots = daySlots(tt, Date.parse(end) + 60000, TZ);
        assert.equal(slots.today.summary.date, '2026-10-16');
        assert.equal(slots.next.summary.date, '2026-10-19');
    });

    test('before the holidays: nothing within the fetched range', () => {
        const end = tt.get('2026-10-23').summary.end;
        const slots = daySlots(tt, Date.parse(end) + 60000, TZ);
        assert.equal(slots.next, null);
        assert.equal(slots.tomorrow.summary.school, false);
    });

    test('a date outside the range is an empty day', () => {
        const slots = daySlots(tt, at('2026-12-01T08:00:00+01:00'), TZ);
        assert.equal(slots.today.lessons.length, 0);
        assert.equal(slots.today.summary.school, false);
    });

    test('current and next lesson, in school', () => {
        const [first, second] = tt.get('2026-10-19').lessons;
        const during = Date.parse(first.start) + 60000;
        assert.equal(currentLesson(tt, during), first);
        assert.equal(nextLesson(tt, during), second);
        assert.equal(inSchool(tt.get('2026-10-19').summary, during), true);
        const evening = at('2026-10-19T20:00:00+02:00');
        assert.equal(currentLesson(tt, evening), null);
        assert.equal(nextLesson(tt, evening).date, '2026-10-20');
        assert.equal(inSchool(tt.get('2026-10-19').summary, evening), false);
    });

    test('both children: earliest start, latest end', () => {
        const ttB = buildTimetable(daysB, {timeGrid, timeZone: TZ});
        const a = tt.get('2026-10-19').summary;
        const b = ttB.get('2026-10-19').summary;
        const all = combineSummaries([a, b]);
        assert.equal(all.school, true);
        assert.equal(all.start, Date.parse(a.start) <= Date.parse(b.start) ? a.start : b.start);
        assert.equal(all.end, Date.parse(a.end) >= Date.parse(b.end) ? a.end : b.end);
        assert.equal(all.lessons, a.lessons + b.lessons);
        assert.equal(combineSummaries([tt.get('2026-10-17').summary]).school, false);
    });
});
