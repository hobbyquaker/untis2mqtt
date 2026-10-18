/**
 * When to fetch next — pure. Substitutions are usually published early in the morning, so school
 * mornings get the short interval; nights the long one; the rest of the day the normal one.
 */

import {localNow} from './timetable.js';

const MORNING = ['06:00', '08:00'];
const NIGHT = ['22:00', '05:30'];

/**
 * @param {number} now ms
 * @param {object} options
 * @param {string} options.timeZone
 * @param {number} options.interval seconds, during the day
 * @param {number} options.morning seconds, 06:00–08:00 on a school day
 * @param {number} options.night seconds, 22:00–05:30
 * @param {boolean} [options.schoolToday] whether today is a school day (unknown → treated as one)
 * @returns {number} ms until the next fetch
 */
export function pollDelay(now, {timeZone, interval, morning, night, schoolToday = true}) {
    const {time} = localNow(now, timeZone);
    let seconds = interval;
    if (time >= NIGHT[0] || time < NIGHT[1]) {
        seconds = night;
    } else if (schoolToday && time >= MORNING[0] && time < MORNING[1]) {
        seconds = morning;
    }
    return Math.max(60, Number(seconds) || 900) * 1000;
}
