/**
 * Everything besides the timetable — pure. Homework, absences, messages, the school's messages of
 * the day and its calendar (school year, time grid, holidays): WebUntis' answers in, the JSON of
 * the topics out. Times are ISO 8601 with the school's offset, dates ISO dates.
 */

import {addDays, localIso} from './timetable.js';
import {hhmm, isoDate} from './untis.js';

/**
 * The account's homework (`/api/homeworks/lessons`), oldest due date first.
 *
 * @param {object} data the `data` of the answer: `homeworks`, `lessons`, `teachers`, `records`
 * @returns {Array<{assigned: string, due: string, subject: string, teacher: string[], text: string,
 *          remark: string, completed: boolean, attachments: number}>}
 */
export function parseHomework(data) {
    const lessons = new Map((data?.lessons || []).map((l) => [l.id, l]));
    const teachers = new Map((data?.teachers || []).map((t) => [t.id, t.name]));
    const teacherOf = new Map((data?.records || []).map((r) => [r.homeworkId, r.teacherId]));
    return (data?.homeworks || [])
        .map((h) => ({
            assigned: isoDate(h.date),
            due: isoDate(h.dueDate),
            subject: lessons.get(h.lessonId)?.subject || '',
            teacher: [teachers.get(teacherOf.get(h.id))].filter(Boolean),
            text: h.text || '',
            remark: h.remark || '',
            completed: Boolean(h.completed),
            attachments: (h.attachments || []).length,
        }))
        .sort((a, b) => a.due.localeCompare(b.due) || a.subject.localeCompare(b.subject));
}

/** homework that is not done and not overdue — what is still to do */
export const openHomework = (homework, today) => homework.filter((h) => !h.completed && h.due >= today);

/**
 * A child's absences (`/api/classreg/absences/students`), newest first.
 *
 * @param {object} data the `data` of the answer
 * @param {string} timeZone
 */
export function parseAbsences(data, timeZone) {
    return (data?.absences || [])
        .map((a) => ({
            date: isoDate(a.startDate),
            start: localIso(`${isoDate(a.startDate)}T${hhmm(a.startTime)}`, timeZone),
            end: localIso(`${isoDate(a.endDate)}T${hhmm(a.endTime)}`, timeZone),
            reason: a.reason || '',
            text: a.text || '',
            excused: Boolean(a.isExcused),
            excuse_status: a.excuseStatus || '',
        }))
        .sort((a, b) => b.start.localeCompare(a.start));
}

/**
 * The account's inbox (`/api/rest/view/v1/messages`), newest first — the list, not the bodies:
 * fetching a body may mark it read in WebUntis.
 */
export function parseMessages(data, timeZone) {
    return (data?.incomingMessages || [])
        .map((m) => ({
            sent: m.sentDateTime ? localIso(m.sentDateTime, timeZone) : null,
            subject: m.subject || '',
            preview: m.contentPreview || '',
            sender: m.sender?.displayName || '',
            read: Boolean(m.isMessageRead),
            attachments: Boolean(m.hasAttachments),
        }))
        .sort((a, b) => String(b.sent).localeCompare(String(a.sent)));
}

/** the school's messages of the day (`/api/public/news/newsWidgetData`) */
export function parseNews(data) {
    return (data?.messagesOfDay || []).map((m) => ({subject: m.subject || '', text: m.text || ''}));
}

/**
 * The exams in the fetched range, from the timetable — the exam endpoints refuse parent accounts at
 * some schools, the timetable shows what is entered there as an exam.
 *
 * @param {Map} timetable from buildTimetable
 */
export function examsFromTimetable(timetable) {
    return [...timetable.values()].flatMap((day) => day.lessons.filter((l) => l.status === 'exam'));
}

/**
 * Exams from `/api/exams`, where the school allows it, in the lesson-like shape of the topics.
 * @param {object} data the `data` of the answer (`exams`)
 */
export function parseExams(data, timeZone) {
    return (data?.exams || [])
        .map((e) => ({
            date: isoDate(e.examDate),
            start: localIso(`${isoDate(e.examDate)}T${hhmm(e.startTime)}`, timeZone),
            end: localIso(`${isoDate(e.examDate)}T${hhmm(e.endTime)}`, timeZone),
            subject: e.subject || '',
            type: e.examType || '',
            name: e.name || '',
            text: e.text || '',
            teacher: [].concat(e.teachers || []).filter(Boolean),
            room: [].concat(e.rooms || []).filter(Boolean),
        }))
        .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * The school's calendar from `app/data`: the school year, the time grid and the holidays that are
 * not over — WebUntis keeps past years' holidays in the list.
 */
export function schoolCalendar(appData, today) {
    return {
        school_year: appData.schoolYear ? {...appData.schoolYear} : null,
        time_grid: appData.timeGrid,
        holidays: appData.holidays.filter((h) => h.end >= today).sort((a, b) => a.start.localeCompare(b.start)),
    };
}

/** the range homework is fetched for: two weeks back (still open?) to the timetable's end */
export function homeworkRange(today, days) {
    return {start: addDays(today, -14), end: addDays(today, days)};
}
