/**
 * The timetable model — pure. WebUntis' `days[]` (REST view API, `timetable/entries`) become
 * lesson objects and day summaries; nothing here knows MQTT.
 *
 * Times on the topics are ISO 8601 with the school's offset, so every local time from
 * WebUntis ("2026-10-19T07:40") is turned into "2026-10-19T07:40:00+02:00" for a time zone that
 * is passed in — the adapter's host or container may well run in UTC.
 */

const ELEMENT_FIELDS = {TEACHER: 'teacher', ROOM: 'room', SUBJECT: 'subject', CLASS: 'class', STUDENT_GROUP: 'group'};

/** minutes east of UTC that `timeZone` has at the given UTC instant */
function offsetMinutes(utcMs, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const v = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
    return Math.round((Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - utcMs) / 60000);
}

/**
 * A local wall-clock time of the school → ISO 8601 with its offset.
 * `localIso('2026-10-19T07:40', 'Europe/Berlin')` → `'2026-10-19T07:40:00+02:00'`
 */
export function localIso(local, timeZone) {
    const [date, time = '00:00'] = String(local).split('T');
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    const asUtc = Date.UTC(y, mo - 1, d, h, mi);
    // the offset at the guessed instant, then once more at the corrected one (DST edges)
    let offset = offsetMinutes(asUtc, timeZone);
    offset = offsetMinutes(asUtc - offset * 60000, timeZone);
    const sign = offset < 0 ? '-' : '+';
    const abs = Math.abs(offset);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `${date}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00${sign}${hh}:${mm}`;
}

/** the date `n` days after an ISO date */
export function addDays(date, n) {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** the Monday of the week a date falls into */
export function weekStart(date) {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday
    return addDays(date, -((day + 6) % 7));
}

/** the school's local date and time of an instant: `{date: '2026-10-19', time: '07:40'}` */
export function localNow(utcMs, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(new Date(utcMs));
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return {date: `${v.year}-${v.month}-${v.day}`, time: `${v.hour}:${v.minute}`};
}

const hm = (local) => String(local).split('T')[1]?.slice(0, 5) || '';

/** the periods of the time grid a lesson covers: a double lesson 07:40–09:15 is [1, 2] */
function periodsOf(start, end, timeGrid) {
    return timeGrid.filter((u) => u.start < end && u.end > start).map((u) => u.period);
}

/** the lesson's status for the topics; the more specific one wins */
function statusOf(entry, changed) {
    const status = String(entry.status || '').toUpperCase();
    const type = String(entry.type || '').toUpperCase();
    if (status === 'CANCELLED') {
        return 'cancelled';
    }
    if (type === 'EXAM') {
        return 'exam';
    }
    if (type === 'EVENT') {
        return 'event';
    }
    if (status === 'ADDITIONAL' || type === 'ADDITIONAL_PERIOD') {
        return 'additional';
    }
    if (status === 'CHANGED' || changed) {
        return 'changed';
    }
    return 'regular';
}

/**
 * One grid entry → the lesson object of the topics.
 *
 * @param {object} entry a `gridEntries[]` element
 * @param {{timeGrid?: Array<{period: number, start: string, end: string}>, timeZone: string}} context
 */
export function parseLesson(entry, {timeGrid = [], timeZone}) {
    const current = {teacher: [], room: [], subject: [], class: [], group: []};
    const removed = {teacher: [], room: [], subject: []};
    const info = [];
    for (let i = 1; i <= 7; i++) {
        for (const position of entry[`position${i}`] || []) {
            const cur = position?.current;
            const rem = position?.removed;
            if (cur?.type === 'INFO') {
                info.push(cur.longName || cur.shortName);
            } else if (cur && ELEMENT_FIELDS[cur.type]) {
                current[ELEMENT_FIELDS[cur.type]].push(cur);
            }
            if (rem && removed[ELEMENT_FIELDS[rem.type]]) {
                removed[ELEMENT_FIELDS[rem.type]].push(rem);
            }
        }
    }
    const short = (list) => list.map((e) => e.shortName).filter(Boolean);
    const changes = {};
    for (const field of ['teacher', 'room', 'subject']) {
        if (removed[field].length > 0) {
            changes[field] = {from: short(removed[field]), to: short(current[field])};
        }
    }
    const texts = entry.texts || [];
    const textOf = (type) => texts.find((t) => t.type === type)?.text || '';
    const startLocal = entry.duration?.start;
    const endLocal = entry.duration?.end;
    const periods = periodsOf(hm(startLocal), hm(endLocal), timeGrid);
    return {
        date: String(startLocal).slice(0, 10),
        start: localIso(startLocal, timeZone),
        end: localIso(endLocal, timeZone),
        period: periods[0] ?? null,
        periods,
        subject: current.subject[0]?.shortName || '',
        subject_long: current.subject[0]?.longName || '',
        teacher: short(current.teacher),
        room: short(current.room),
        class: short(current.class),
        group: short(current.group),
        status: statusOf(entry, Object.keys(changes).length > 0),
        moved: String(entry.statusDetail || '').toUpperCase() === 'MOVED' || Boolean(entry.moved),
        changes,
        text: entry.substitutionText || textOf('SUBSTITUTION_TEXT'),
        info: [entry.lessonInfo || textOf('LESSON_INFO'), entry.lessonText, ...info].filter(Boolean).join(' · '),
        notes: entry.notesAll || textOf('NOTES_FOR_ALL'),
        homework: (entry.icons || []).includes('HOMEWORK'),
        color: /^[0-9a-f]{6}$/i.test(entry.color || '') ? `#${entry.color.toLowerCase()}` : null,
    };
}

/** cancelled, changed, extra or moved — what the parents want to know about; events and exams as such are not */
export const isChange = (lesson) => ['cancelled', 'changed', 'additional'].includes(lesson.status) || lesson.moved;

/** a lesson that is not cancelled takes place — events and extra lessons included */
export const takesPlace = (lesson) => lesson.status !== 'cancelled';

/** the holiday a date falls into, or null */
export function holidayOn(date, holidays = []) {
    return holidays.find((h) => h.start <= date && date <= h.end) || null;
}

/**
 * One day's summary.
 *
 * `start`/`end` are the first and last lesson that take place; `start_planned`/`end_planned` the
 * same per the regular timetable — cancelled lessons count there, extra lessons do not — so a
 * cancelled first lesson shows as start ≠ start_planned.
 */
export function summarizeDay(date, lessons, {holidays = []} = {}) {
    const happening = lessons.filter(takesPlace);
    const planned = lessons.filter((l) => l.status !== 'additional');
    const first = (list) => list.reduce((a, l) => (a === null || l.start < a ? l.start : a), null);
    const last = (list) => list.reduce((a, l) => (a === null || l.end > a ? l.end : a), null);
    const holiday = holidayOn(date, holidays);
    return {
        date,
        school: happening.length > 0,
        start: first(happening),
        end: last(happening),
        start_planned: first(planned),
        end_planned: last(planned),
        lessons: happening.length,
        changes: lessons.filter(isChange).length,
        holiday: holiday?.name ?? null,
    };
}

/**
 * The whole fetched range: lessons per date, sorted by start, and a summary per date.
 *
 * @param {Array<object>} days WebUntis `days[]`
 * @param {{timeGrid?: Array, holidays?: Array, timeZone: string}} context
 * @returns {Map<string, {lessons: Array<object>, summary: object}>} by ISO date, in date order
 */
export function buildTimetable(days, {timeGrid = [], holidays = [], timeZone}) {
    const byDate = new Map();
    for (const day of [...days].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
        const date = String(day.date).slice(0, 10);
        const lessons = (day.gridEntries || [])
            .map((entry) => parseLesson(entry, {timeGrid, timeZone}))
            .sort((a, b) => a.start.localeCompare(b.start) || a.subject.localeCompare(b.subject));
        byDate.set(date, {lessons, summary: summarizeDay(date, lessons, {holidays})});
    }
    return byDate;
}

/**
 * The three day slots of the topics. `today` and `tomorrow` by the calendar; `next` is the next
 * school day that is not over yet — after the last lesson today it moves on, and it skips
 * weekends, holidays and days without a lesson that takes place.
 *
 * @param {Map<string, {lessons, summary}>} timetable from buildTimetable
 * @param {number} now ms
 * @param {string} timeZone
 * @returns {{today: object, tomorrow: object, next: object|null}} each `{lessons, summary}`; a date
 *          outside the fetched range has no lessons
 */
export function daySlots(timetable, now, timeZone) {
    const {date: today} = localNow(now, timeZone);
    const tomorrow = addDays(today, 1);
    const nowIso = new Date(now).toISOString();
    const empty = (date) => ({lessons: [], summary: summarizeDay(date, [])});
    let next = null;
    for (const [date, day] of timetable) {
        if (date < today || !day.summary.school) {
            continue;
        }
        if (date === today && Date.parse(day.summary.end) <= Date.parse(nowIso)) {
            continue;
        }
        next = day;
        break;
    }
    return {
        today: timetable.get(today) || empty(today),
        tomorrow: timetable.get(tomorrow) || empty(tomorrow),
        next,
    };
}

/** the children's summaries of one slot combined: earliest start, latest end, school if any has */
export function combineSummaries(summaries) {
    const present = summaries.filter(Boolean);
    const pick = (key, better) =>
        present.map((s) => s[key]).reduce((a, v) => (v !== null && (a === null || better(v, a)) ? v : a), null);
    const earlier = (a, b) => Date.parse(a) < Date.parse(b);
    const later = (a, b) => Date.parse(a) > Date.parse(b);
    const dates = [...new Set(present.map((s) => s.date))].sort();
    return {
        date: dates[0] ?? null,
        school: present.some((s) => s.school),
        start: pick('start', earlier),
        end: pick('end', later),
        start_planned: pick('start_planned', earlier),
        end_planned: pick('end_planned', later),
        lessons: present.reduce((n, s) => n + s.lessons, 0),
        changes: present.reduce((n, s) => n + s.changes, 0),
    };
}

/** the lesson taking place at `now`, or null (breaks, before and after school) */
export function currentLesson(timetable, now) {
    for (const {lessons} of timetable.values()) {
        const lesson = lessons.find((l) => takesPlace(l) && Date.parse(l.start) <= now && now < Date.parse(l.end));
        if (lesson) {
            return lesson;
        }
    }
    return null;
}

/** the next lesson that takes place and has not started yet, across days */
export function nextLesson(timetable, now) {
    for (const {lessons} of timetable.values()) {
        const lesson = lessons.find((l) => takesPlace(l) && Date.parse(l.start) > now);
        if (lesson) {
            return lesson;
        }
    }
    return null;
}

/** between today's first and last lesson that take place */
export function inSchool(todaySummary, now) {
    return Boolean(todaySummary?.school && Date.parse(todaySummary.start) <= now && now < Date.parse(todaySummary.end));
}
