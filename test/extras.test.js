import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describe, test} from 'node:test';

import {
    examsFromTimetable,
    homeworkRange,
    openHomework,
    parseAbsences,
    parseExams,
    parseHomework,
    parseMessages,
    parseNews,
    schoolCalendar,
} from '../lib/extras.js';
import {extraItems, schoolItems} from '../lib/items.js';
import {buildTimetable, parseLesson} from '../lib/timetable.js';
import {parseAppData} from '../lib/untis.js';

const TZ = 'Europe/Berlin';
const read = (name) => JSON.parse(readFileSync(new URL(`fixtures/webuntis/${name}`, import.meta.url), 'utf8'));
const appData = parseAppData(read('account-a-appdata.json'));
const {timeGrid} = appData;

// synthetic: the shape of WebUntis' inbox list, invented content
const INBOX = {
    incomingMessages: [
        {
            id: 1,
            subject: 'Elternabend',
            contentPreview: 'Liebe Eltern, …',
            sender: {displayName: 'T1', userId: 7, className: null, imageUrl: null},
            sentDateTime: '2026-10-12T18:05',
            hasAttachments: true,
            isMessageRead: false,
        },
        {
            id: 2,
            subject: 'Ausflug',
            contentPreview: '…',
            sender: {displayName: 'T2'},
            sentDateTime: '2026-10-14T07:30',
            hasAttachments: false,
            isMessageRead: true,
        },
    ],
    readConfirmationMessages: [],
};

describe('homework', () => {
    const homework = parseHomework(read('account-a-homework.json').data);

    test('subject, teacher, dates, sorted by due date', () => {
        assert.equal(homework.length, 3);
        assert.deepEqual(
            homework.map((h) => h.due),
            ['2026-10-14', '2026-10-15', '2026-10-23'],
        );
        const [first] = homework;
        assert.match(first.assigned, /^\d{4}-\d\d-\d\d$/);
        assert.match(first.subject, /^F\d+$/);
        assert.equal(first.teacher.length, 1);
        assert.match(first.text, /^text \d+$/);
        assert.equal(first.completed, false);
        assert.equal(first.attachments, 0);
    });

    test('open: not done, not overdue', () => {
        assert.equal(openHomework(homework, '2026-10-16').length, 1);
        assert.equal(openHomework(homework, '2026-10-01').length, 3);
    });

    test('range: two weeks back to the end of the timetable', () => {
        assert.deepEqual(homeworkRange('2026-10-19', 14), {start: '2026-10-05', end: '2026-11-02'});
    });
});

describe('absences, messages, news', () => {
    test('absences: ISO times, excused, newest first', () => {
        const absences = parseAbsences(read('account-b-absences.json').data, TZ);
        assert.equal(absences.length, 4);
        assert.match(absences[0].start, /^\d{4}-\d\d-\d\dT\d\d:\d\d:00\+0[12]:00$/);
        assert.ok(absences.every((a, i) => i === 0 || absences[i - 1].start >= a.start));
        assert.ok(absences.every((a) => typeof a.excused === 'boolean'));
        assert.ok(absences.some((a) => a.excuse_status === 'entschuldigt'));
    });

    test('messages: the list, newest first, unread kept', () => {
        const messages = parseMessages(INBOX, TZ);
        assert.equal(messages[0].subject, 'Ausflug');
        assert.equal(messages[1].sent, '2026-10-12T18:05:00+02:00');
        assert.equal(messages[1].read, false);
        assert.equal(messages[1].attachments, true);
        assert.equal(messages[1].sender, 'T1');
    });

    test('news', () => {
        assert.deepEqual(parseNews(read('account-a-news.json').data), []);
        assert.deepEqual(parseNews({messagesOfDay: [{subject: 'S', text: 'T', id: 1}]}), [{subject: 'S', text: 'T'}]);
    });
});

describe('exams', () => {
    test('from the timetable', () => {
        const days = structuredClone(read('account-a-timetable.json').days);
        days.find((d) => d.date.startsWith('2026-10-21')).gridEntries[0].type = 'EXAM';
        const exams = examsFromTimetable(buildTimetable(days, {timeGrid, timeZone: TZ}));
        assert.equal(exams.length, 1);
        assert.equal(exams[0].status, 'exam');
        assert.equal(exams[0].date, '2026-10-21');
    });

    test('from /api/exams where the school allows it', () => {
        const exams = parseExams(
            {
                exams: [
                    {
                        examDate: 20261105,
                        startTime: 830,
                        endTime: 1000,
                        subject: 'M',
                        examType: 'KA',
                        name: 'KA 2',
                        teachers: ['T1'],
                        rooms: ['R1'],
                    },
                ],
            },
            TZ,
        );
        assert.deepEqual(exams[0], {
            date: '2026-11-05',
            start: '2026-11-05T08:30:00+01:00',
            end: '2026-11-05T10:00:00+01:00',
            subject: 'M',
            type: 'KA',
            name: 'KA 2',
            text: '',
            teacher: ['T1'],
            room: ['R1'],
        });
    });
});

describe('lesson details', () => {
    test('colour, homework and notes', () => {
        const [entry] = read('account-a-timetable.json').days.find((d) => d.date.startsWith('2026-10-19')).gridEntries;
        const lesson = parseLesson(
            {...entry, color: 'FF8000', icons: ['HOMEWORK', 'NOTES'], texts: [{type: 'NOTES_FOR_ALL', text: 'n'}]},
            {timeGrid, timeZone: TZ},
        );
        assert.equal(lesson.color, '#ff8000');
        assert.equal(lesson.homework, true);
        assert.equal(lesson.notes, 'n');
        const plain = parseLesson({...entry, color: '', icons: []}, {timeGrid, timeZone: TZ});
        assert.equal(plain.color, null);
        assert.equal(plain.homework, false);
        assert.equal(plain.notes, '');
    });
});

describe('extra items', () => {
    const groups = new Set(['homework', 'exams', 'absences', 'messages', 'school']);
    const timetable = buildTimetable(read('account-a-timetable.json').days, {timeGrid, timeZone: TZ});

    test('per child, with counts; refused endpoints leave their items out', () => {
        const homework = parseHomework(read('account-a-homework.json').data);
        const items = extraItems(
            'anna',
            {homework, messages: parseMessages(INBOX, TZ)},
            {
                timetable,
                now: Date.parse('2026-10-14T12:00:00+02:00'),
                today: '2026-10-14',
                tomorrow: '2026-10-15',
                groups,
            },
        );
        assert.equal(items['anna/homework'].length, 3);
        assert.equal(items['anna/homework/open'], 3);
        assert.equal(items['anna/homework/due_tomorrow'], 1);
        assert.equal(items['anna/messages/unread'], 1);
        assert.deepEqual(items['anna/exams'], []);
        assert.equal(items['anna/exams/next'], null);
        assert.ok(!('anna/absences' in items));
    });

    test('school-wide: the holidays still to come', () => {
        const calendar = schoolCalendar(appData, '2026-10-18');
        assert.equal(calendar.school_year.name, '2026/2027');
        assert.equal(calendar.time_grid.length, 12);
        assert.deepEqual(calendar.holidays, []); // the fixture's list is from past years
        const items = schoolItems({calendar, news: []}, {groups});
        assert.deepEqual(Object.keys(items).sort(), [
            'school/holidays',
            'school/news',
            'school/school_year',
            'school/time_grid',
        ]);
        assert.deepEqual(schoolItems({calendar}, {groups: new Set()}), {});
    });
});
