import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {pollDelay} from '../lib/schedule.js';

const options = {timeZone: 'Europe/Berlin', interval: 900, morning: 300, night: 3600};
const at = (local) => Date.parse(`${local}+02:00`);

describe('schedule', () => {
    test('day, school morning, night', () => {
        assert.equal(pollDelay(at('2026-10-19T12:00:00'), options), 900_000);
        assert.equal(pollDelay(at('2026-10-19T06:30:00'), options), 300_000);
        assert.equal(pollDelay(at('2026-10-19T23:00:00'), options), 3_600_000);
        assert.equal(pollDelay(at('2026-10-19T03:00:00'), options), 3_600_000);
        assert.equal(pollDelay(at('2026-10-19T05:45:00'), options), 900_000);
    });

    test('no short morning interval on a day without school', () => {
        assert.equal(pollDelay(at('2026-10-17T06:30:00'), {...options, schoolToday: false}), 900_000);
    });

    test('never below a minute', () => {
        assert.equal(pollDelay(at('2026-10-19T12:00:00'), {...options, interval: 5}), 60_000);
    });
});
