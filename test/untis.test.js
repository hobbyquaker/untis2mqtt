import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describe, test} from 'node:test';

import {
    createSession,
    hhmm,
    isAuthError,
    isoDate,
    parseAppData,
    searchSchools,
    splitStudentName,
    timetableLastName,
    ymd,
} from '../lib/untis.js';

const fixture = (name) => readFileSync(new URL(`fixtures/webuntis/${name}`, import.meta.url), 'utf8');
const header = Buffer.from(JSON.stringify({alg: 'HS256'})).toString('base64url');
const jwt = (exp) => `${header}.${Buffer.from(JSON.stringify({exp})).toString('base64url')}.sig`;

/**
 * A fake WebUntis: routes by path, records every request, sets the session cookies on login.
 * `routes` may override any path with (request) => {status, body, cookies}.
 */
function fakeUntis(routes = {}, {now = () => 1_800_000_000_000} = {}) {
    const requests = [];
    const defaults = {
        '/WebUntis/jsonrpc.do': (req) =>
            JSON.parse(req.body).method === 'authenticate'
                ? {
                      body: {result: {sessionId: 'S', personType: 12}},
                      cookies: ['JSESSIONID=abc; Path=/', 'Tenant-Id="42"; Path=/', 'schoolname="_ZXg="; Path=/'],
                  }
                : {body: {result: null}},
        '/WebUntis/api/token/new': () => ({body: jwt(Math.floor(now() / 1000) + 900), text: true}),
        '/WebUntis/api/rest/view/v1/app/data': () => ({body: JSON.parse(fixture('account-a-appdata.json'))}),
        '/WebUntis/api/rest/view/v1/timetable/entries': () => ({body: JSON.parse(fixture('account-a-timetable.json'))}),
        '/WebUntis/api/homeworks/lessons': () => ({body: JSON.parse(fixture('account-a-homework.json'))}),
        '/WebUntis/api/classreg/absences/students': () => ({body: JSON.parse(fixture('account-b-absences.json'))}),
        '/WebUntis/api/exams': () => ({status: 403, body: JSON.parse(fixture('account-a-exams.json'))}),
        '/WebUntis/api/public/news/newsWidgetData': () => ({body: JSON.parse(fixture('account-a-news.json'))}),
    };
    async function fetch(url, init = {}) {
        const u = new URL(url);
        const req = {
            path: u.pathname,
            query: u.searchParams,
            headers: init.headers || {},
            body: init.body,
            method: init.method || 'GET',
        };
        requests.push(req);
        const route = routes[u.pathname] || defaults[u.pathname];
        const res = route ? route(req) : {status: 404, body: {}};
        if (res instanceof Error) {
            throw res;
        }
        const text = res.text || typeof res.body === 'string' ? String(res.body) : JSON.stringify(res.body);
        return {
            status: res.status || 200,
            headers: {getSetCookie: () => res.cookies || []},
            text: async () => text,
        };
    }
    return {fetch, requests};
}

const options = (fake, extra = {}) => ({
    server: 'example.webuntis.com',
    school: 'example',
    username: 'parent',
    password: 'pw',
    fetch: fake.fetch,
    sleep: async () => {},
    now: () => 1_800_000_000_000,
    ...extra,
});

describe('untis helpers', () => {
    test('date and time formats', () => {
        assert.equal(isoDate(20261019), '2026-10-19');
        assert.equal(isoDate('2026-10-19T07:40'), '2026-10-19');
        assert.equal(ymd('2026-10-19'), '20261019');
        assert.equal(hhmm(740), '07:40');
        assert.equal(hhmm(1205), '12:05');
    });

    test('student names: "Lastname Firstname", the timetable knows the last name', () => {
        assert.deepEqual(splitStudentName('Muster Max'), {lastName: 'Muster', firstName: 'Max'});
        assert.deepEqual(splitStudentName('von Muster Max Paul', 'von Muster'), {
            lastName: 'von Muster',
            firstName: 'Max Paul',
        });
        assert.deepEqual(splitStudentName('Muster', undefined), {lastName: 'Muster', firstName: ''});
        assert.equal(timetableLastName(JSON.parse(fixture('account-a-timetable.json')).days), 'Child');
    });

    test('app data: children, school year, time grid, holidays', () => {
        const data = parseAppData(JSON.parse(fixture('account-a-appdata.json')));
        assert.deepEqual(data.children, [{id: 100, displayName: 'Child A'}]);
        assert.deepEqual(data.schoolYear, {id: 16, name: '2026/2027', start: '2026-09-14', end: '2027-07-28'});
        assert.deepEqual(data.timeGrid[0], {period: 1, start: '07:40', end: '08:25'});
        assert.equal(data.timeGrid.length, 12);
        assert.equal(data.holidays.length, 7);
        assert.deepEqual(data.roles, ['LEGAL_GUARDIAN']);
    });

    test('school search', async () => {
        const fetch = async (url, init) => {
            assert.equal(url, 'https://mobile.webuntis.com/ms/schoolquery2');
            assert.equal(JSON.parse(init.body).params[0].search, 'Example');
            return {
                json: async () => ({
                    result: {
                        schools: [
                            {server: 'ex.webuntis.com', loginName: 'ex', displayName: 'Example', address: 'Town'},
                        ],
                    },
                }),
            };
        };
        assert.deepEqual(await searchSchools('Example', {fetch}), [
            {server: 'ex.webuntis.com', school: 'ex', name: 'Example', address: 'Town'},
        ]);
        const tooMany = async () => ({json: async () => ({error: {code: -6003, message: 'too many results'}})});
        await assert.rejects(searchSchools('a', {fetch: tooMany}), /too many results/);
    });
});

describe('untis session', () => {
    test('logs in once, then sends token, tenant and school year with every call', async () => {
        const fake = fakeUntis();
        const session = createSession(options(fake));
        const data = await session.appData();
        assert.equal(data.children.length, 1);
        const days = await session.timetable(100, '2026-10-12', '2026-11-01');
        assert.equal(days.length, 22);

        const paths = fake.requests.map((r) => r.path);
        assert.deepEqual(paths, [
            '/WebUntis/jsonrpc.do',
            '/WebUntis/api/token/new',
            '/WebUntis/api/rest/view/v1/app/data',
            '/WebUntis/api/rest/view/v1/timetable/entries',
        ]);
        const login = JSON.parse(fake.requests[0].body);
        assert.equal(login.method, 'authenticate');
        assert.equal(fake.requests[0].query.get('school'), 'example');
        // all cookies, not only the session id, or token/new answers with a useless token
        assert.match(fake.requests[1].headers.cookie, /JSESSIONID=abc/);
        assert.match(fake.requests[1].headers.cookie, /Tenant-Id=/);
        const tt = fake.requests[3];
        assert.match(tt.headers.authorization, /^Bearer eyJ/);
        assert.equal(tt.headers['tenant-id'], '42');
        assert.equal(tt.headers['x-webuntis-api-school-year-id'], '16');
        assert.equal(tt.query.get('resources'), '100');
        assert.equal(tt.query.get('resourceType'), 'STUDENT');
        assert.equal(tt.query.get('start'), '2026-10-12');
    });

    test('the secret logs in with a one-time password', async () => {
        const fake = fakeUntis({
            '/WebUntis/jsonrpc_intern.do': () => ({body: {result: {}}, cookies: ['JSESSIONID=x']}),
        });
        const session = createSession(options(fake, {password: undefined, secret: 'GEZDGNBVGY3TQOJQ'}));
        await session.appData();
        const req = fake.requests[0];
        assert.equal(req.path, '/WebUntis/jsonrpc_intern.do');
        assert.equal(req.query.get('m'), 'getUserData2017');
        const auth = JSON.parse(req.body).params[0].auth;
        assert.equal(auth.user, 'parent');
        assert.match(auth.otp, /^\d{6}$/);
    });

    test('a wrong password is an auth error and is not retried', async () => {
        const fake = fakeUntis({
            '/WebUntis/jsonrpc.do': () => ({body: {error: {code: -8504, message: 'bad credentials'}}}),
        });
        const session = createSession(options(fake));
        await assert.rejects(session.appData(), (error) => isAuthError(error) && /bad credentials/.test(error.message));
        assert.equal(fake.requests.length, 1);
    });

    test('the login page instead of JSON means the session is gone: one fresh login', async () => {
        let first = true;
        const fake = fakeUntis({
            '/WebUntis/api/rest/view/v1/app/data': () => {
                if (first) {
                    first = false;
                    return {body: '<!DOCTYPE html><html>login</html>', text: true};
                }
                return {body: JSON.parse(fixture('account-a-appdata.json'))};
            },
        });
        const session = createSession(options(fake));
        await session.appData();
        assert.equal(fake.requests.filter((r) => r.path === '/WebUntis/jsonrpc.do').length, 2);
    });

    test('a second refusal after the fresh login is an auth error', async () => {
        const fake = fakeUntis({'/WebUntis/api/rest/view/v1/app/data': () => ({status: 401, body: {}})});
        await assert.rejects(createSession(options(fake)).appData(), isAuthError);
    });

    test('logs in again after nine idle minutes', async () => {
        let t = 1_800_000_000_000;
        const fake = fakeUntis({}, {now: () => t});
        const session = createSession(options(fake, {now: () => t}));
        await session.appData();
        t += 5 * 60 * 1000;
        await session.appData();
        assert.equal(fake.requests.filter((r) => r.path === '/WebUntis/jsonrpc.do').length, 1);
        t += 10 * 60 * 1000;
        await session.appData();
        assert.equal(fake.requests.filter((r) => r.path === '/WebUntis/jsonrpc.do').length, 2);
    });

    test('503 and network errors are retried, then reported', async () => {
        let calls = 0;
        const fake = fakeUntis({
            '/WebUntis/api/rest/view/v1/app/data': () => (++calls < 3 ? {status: 503, body: {}} : {body: {}}),
        });
        await createSession(options(fake)).appData();
        assert.equal(calls, 3);

        const down = fakeUntis({'/WebUntis/jsonrpc.do': () => new Error('ECONNREFUSED')});
        await assert.rejects(createSession(options(down)).appData(), (e) => e.code === 'NETWORK');
        assert.equal(down.requests.length, 3);
    });

    test('a timetable without days[] is an error, not an empty day', async () => {
        const fake = fakeUntis({'/WebUntis/api/rest/view/v1/timetable/entries': () => ({body: {format: 5}})});
        await assert.rejects(createSession(options(fake)).timetable(1, '2026-10-19', '2026-10-19'), /without days/);
    });

    test('homework, absences, news; exams refused as FORBIDDEN', async () => {
        const fake = fakeUntis();
        const session = createSession(options(fake));
        assert.equal((await session.homework('2026-10-12', '2026-11-01')).homeworks.length, 3);
        assert.equal((await session.absences(100, '2026-08-01', '2026-10-18')).absences.length, 4);
        assert.deepEqual((await session.news('2026-10-18')).messagesOfDay, []);
        await assert.rejects(session.exams(100, '2026-10-18', '2026-12-18'), (e) => e.code === 'FORBIDDEN');
        const hw = fake.requests.find((r) => r.path === '/WebUntis/api/homeworks/lessons');
        assert.equal(hw.query.get('startDate'), '20261012');
    });

    test('an account needs a password or a secret', () => {
        assert.throws(() => createSession({server: 's', school: 'x', username: 'u'}), /password or secret/);
    });
});
