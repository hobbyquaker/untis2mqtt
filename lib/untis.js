/**
 * WebUntis client — the only module that knows a WebUntis path or field name.
 *
 * WebUntis has no public API for parents and students. This talks to the interface the WebUntis
 * web app itself uses: a JSON-RPC login (`/WebUntis/jsonrpc.do`, or `jsonrpc_intern.do` with a
 * one-time password from the app secret), a JWT from `/WebUntis/api/token/new`, and the REST
 * "view" API with `Authorization: Bearer`, `Tenant-Id` and the school year header. Checked against a
 * real school; the structure follows MMM-Webuntis (MIT,
 * github.com/HeikoGr/MMM-Webuntis), whose session handling showed where it breaks:
 *
 * - a session ends after about ten minutes without a request, and an expired one is answered
 *   with the login page (HTML, often with status 200) rather than an error;
 * - a timetable without `days[]` is a broken answer, never "no lessons".
 *
 * Untis has announced a new, more restricted API (expected 2027); keeping every detail here means
 * a move touches this file only.
 */

import {totp} from './totp.js';

const SCHOOL_SEARCH = 'https://mobile.webuntis.com/ms/schoolquery2';
/** sessions expire after ~10 min idle; log in again before that rather than after a failure */
const SESSION_IDLE_MS = 9 * 60 * 1000;
/** renew the JWT this long before it expires */
const TOKEN_MARGIN_MS = 60 * 1000;
const RETRY_DELAYS_MS = [2000, 8000];

export class UntisError extends Error {
    /**
     * @param {string} message
     * @param {{code?: string, status?: number, cause?: Error}} [options]
     */
    constructor(message, {code = 'UNTIS', status, cause} = {}) {
        super(message, {cause});
        this.name = 'UntisError';
        this.code = code;
        this.status = status;
    }
}

/** a refused login or token: retrying with the same credentials will not help */
export const isAuthError = (error) => error instanceof UntisError && error.code === 'AUTH';

/** `20261019` or `'2026-10-19…'` → `'2026-10-19'` */
export function isoDate(value) {
    const s = String(value);
    return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s.slice(0, 10);
}

/** `'2026-10-19'` → `20261019` (the date format of the older endpoints) */
export function ymd(value) {
    return isoDate(value).replaceAll('-', '');
}

/** `740` → `'07:40'` */
export function hhmm(value) {
    const n = Number(value);
    return `${String(Math.floor(n / 100)).padStart(2, '0')}:${String(n % 100).padStart(2, '0')}`;
}

/** the payload of a JWT, or null; only `exp` is used */
function jwtPayload(token) {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    } catch {
        return null;
    }
}

/**
 * Untis' school search: the server and the login name of a school from its name or town.
 *
 * @param {string} text
 * @param {{fetch?: typeof fetch}} [deps]
 * @returns {Promise<Array<{server: string, school: string, name: string, address: string}>>}
 */
export async function searchSchools(text, {fetch = globalThis.fetch} = {}) {
    const response = await fetch(SCHOOL_SEARCH, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({id: '1', method: 'searchSchool', params: [{search: String(text)}], jsonrpc: '2.0'}),
    });
    const body = await response.json();
    if (body.error) {
        // "too many results" comes as an error, not as a long list
        throw new UntisError(`school search: ${body.error.message || body.error.code}`, {code: 'SEARCH'});
    }
    return (body.result?.schools || []).map((s) => ({
        server: s.server,
        school: s.loginName,
        name: s.displayName,
        address: s.address,
    }));
}

/**
 * A student's `displayName` is "Lastname Firstname" (checked at one school, 2026-10-18). The
 * timetable carries the last name on its own (`resource.longName`); with it a double last name
 * splits correctly, without it the first word is taken as the last name.
 *
 * @returns {{firstName: string, lastName: string}}
 */
export function splitStudentName(displayName, lastName) {
    const name = String(displayName || '').trim();
    if (lastName && name.startsWith(lastName + ' ')) {
        return {lastName, firstName: name.slice(lastName.length + 1).trim()};
    }
    const [last = '', ...first] = name.split(/\s+/);
    return {lastName: last, firstName: first.join(' ')};
}

/** the last name the timetable gives for its student, if any */
export function timetableLastName(days) {
    return days.find((d) => d.resource?.longName)?.resource.longName;
}

/**
 * `app/data` → what the adapter needs: the children the account may see, the school year with its
 * time grid, the holidays and the account's permissions.
 */
export function parseAppData(data) {
    const year = data?.currentSchoolYear;
    return {
        children: (data?.user?.students || []).map((s) => ({id: s.id, displayName: s.displayName})),
        schoolYear: year
            ? {id: year.id, name: year.name, start: isoDate(year.dateRange?.start), end: isoDate(year.dateRange?.end)}
            : null,
        timeGrid: (year?.timeGrid?.units || []).map((u) => ({
            period: u.unitOfDay,
            start: hhmm(u.startTime),
            end: hhmm(u.endTime),
        })),
        holidays: (data?.holidays || []).map((h) => ({name: h.name, start: isoDate(h.start), end: isoDate(h.end)})),
        permissions: data?.permissions || [],
        roles: data?.user?.roles || [],
    };
}

/**
 * One account's session. Requests log in on demand, renew the token before it expires, log in
 * again after nine idle minutes or when WebUntis answers with its login page, and retry twice with
 * back-off on 429, 5xx and network errors. A refused login is not retried.
 *
 * @param {object} options
 * @param {string} options.server e.g. `example.webuntis.com`
 * @param {string} options.school the login name of the school
 * @param {string} options.username
 * @param {string} [options.password]
 * @param {string} [options.secret] the app secret (base32), instead of the password
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {{debug: Function}} [options.log]
 */
export function createSession({
    server,
    school,
    username,
    password,
    secret,
    fetch = globalThis.fetch,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = {debug() {}},
}) {
    if (!username || !(password || secret)) {
        throw new UntisError('an account needs a username and a password or secret', {code: 'CONFIG'});
    }
    const base = `https://${server}/WebUntis`;
    const cookies = new Map();
    let token = null;
    let tokenExpires = 0;
    let tenantId = null;
    let schoolYearId = null;
    let lastRequest = 0;
    let loggedIn = false;
    let loggingIn = null;

    const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const route = (path) => path.split('?')[0];

    function keepCookies(response) {
        for (const line of response.headers.getSetCookie?.() || []) {
            const pair = line.split(';')[0];
            const eq = pair.indexOf('=');
            if (eq > 0) {
                cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
            }
        }
    }

    /** one HTTP request with the session's cookies; 429, 5xx and network errors are retried */
    async function send(path, init = {}) {
        for (let attempt = 0; ; attempt++) {
            let response;
            try {
                response = await fetch(base + path, {
                    ...init,
                    redirect: 'manual',
                    headers: {...init.headers, cookie: cookieHeader()},
                });
            } catch (error) {
                if (attempt < RETRY_DELAYS_MS.length) {
                    log.debug(`untis: ${route(path)} failed (${error.message}), retrying`);
                    await sleep(RETRY_DELAYS_MS[attempt]);
                    continue;
                }
                throw new UntisError(`${server} unreachable: ${error.message}`, {code: 'NETWORK', cause: error});
            }
            keepCookies(response);
            if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS_MS.length) {
                log.debug(`untis: ${route(path)} answered ${response.status}, retrying`);
                await sleep(RETRY_DELAYS_MS[attempt]);
                continue;
            }
            lastRequest = now();
            return response;
        }
    }

    async function rpc(path, method, params) {
        const response = await send(path, {
            method: 'POST',
            headers: {'content-type': 'application/json', accept: 'application/json'},
            body: JSON.stringify({id: String(now()), method, params, jsonrpc: '2.0'}),
        });
        const text = await response.text();
        let body;
        try {
            body = JSON.parse(text);
        } catch {
            throw new UntisError(`${method}: no JSON from ${server} (HTTP ${response.status})`, {
                status: response.status,
            });
        }
        if (body.error) {
            // -8504 bad credentials, -8509/-8998 user locked or blocked: retrying will not help
            throw new UntisError(`${method}: ${body.error.message || 'refused'} (${body.error.code})`, {
                code: 'AUTH',
                status: response.status,
            });
        }
        return body.result;
    }

    async function fetchToken() {
        // no Accept header: text/plain is refused with 406, json gets the login page
        const response = await send('/api/token/new');
        const text = (await response.text()).trim();
        if (response.status !== 200 || !text.startsWith('eyJ') || text.split('.').length !== 3) {
            throw new UntisError(`no token from ${server} (HTTP ${response.status})`, {
                code: 'AUTH',
                status: response.status,
            });
        }
        token = text;
        const exp = jwtPayload(text)?.exp;
        tokenExpires = exp ? exp * 1000 : now() + 10 * 60 * 1000;
    }

    async function doLogin() {
        cookies.clear();
        token = null;
        loggedIn = false;
        const at = `school=${encodeURIComponent(school)}`;
        if (secret) {
            await rpc(`/jsonrpc_intern.do?m=getUserData2017&${at}&v=i2.2`, 'getUserData2017', [
                {auth: {clientTime: now(), user: username, otp: totp(secret, now())}},
            ]);
        } else {
            await rpc(`/jsonrpc.do?${at}`, 'authenticate', {user: username, password, client: 'untis2mqtt'});
        }
        if (!cookies.has('JSESSIONID')) {
            throw new UntisError(`${server} returned no session`, {code: 'AUTH'});
        }
        tenantId = cookies.get('Tenant-Id')?.replaceAll('"', '') || tenantId;
        await fetchToken();
        loggedIn = true;
        log.debug(`untis: logged in as ${username}`);
    }

    /** log in; concurrent callers share one attempt */
    function login() {
        loggingIn ||= doLogin().finally(() => {
            loggingIn = null;
        });
        return loggingIn;
    }

    async function ensureSession() {
        if (loggingIn) {
            await loggingIn;
        }
        if (!loggedIn || now() - lastRequest > SESSION_IDLE_MS) {
            await login();
        } else if (tokenExpires - now() < TOKEN_MARGIN_MS) {
            await fetchToken();
        }
    }

    /** GET a JSON endpoint of the web app; one fresh login when the session turns out to be gone */
    async function get(path, retried = false) {
        await ensureSession();
        const response = await send(path, {
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${token}`,
                ...(tenantId && {'tenant-id': tenantId}),
                ...(schoolYearId && {'x-webuntis-api-school-year-id': String(schoolYearId)}),
            },
        });
        const text = await response.text();
        const loginPage = /^\s*</.test(text);
        if (response.status === 401 || (response.status >= 300 && response.status < 400) || loginPage) {
            loggedIn = false;
            if (!retried) {
                log.debug(`untis: session gone at ${route(path)}, logging in again`);
                return get(path, true);
            }
            throw new UntisError(`${route(path)}: not authorised (HTTP ${response.status})`, {
                code: 'AUTH',
                status: response.status,
            });
        }
        let body;
        try {
            body = JSON.parse(text);
        } catch {
            throw new UntisError(`${route(path)}: no JSON (HTTP ${response.status})`, {status: response.status});
        }
        if (response.status >= 400) {
            const title = body?.errors?.[0]?.title || body?.errorMessage || `HTTP ${response.status}`;
            throw new UntisError(`${route(path)}: ${title}`, {
                code: response.status === 403 ? 'FORBIDDEN' : 'HTTP',
                status: response.status,
            });
        }
        return body;
    }

    return {
        get username() {
            return username;
        },
        get loggedIn() {
            return loggedIn;
        },
        login,

        /** children, school year, time grid, holidays; also sets the school year header for later calls */
        async appData() {
            const data = parseAppData(await get('/api/rest/view/v1/app/data'));
            schoolYearId = data.schoolYear?.id ?? schoolYearId;
            return data;
        },

        /**
         * The raw `days[]` of a child's timetable, one entry per day of the range.
         * @param {number} studentId
         * @param {string} start ISO date
         * @param {string} end ISO date
         */
        async timetable(studentId, start, end) {
            const params = new URLSearchParams({
                start: isoDate(start),
                end: isoDate(end),
                format: '4',
                resourceType: 'STUDENT',
                resources: String(studentId),
                periodTypes: '',
                timetableType: 'MY_TIMETABLE',
            });
            const body = await get(`/api/rest/view/v1/timetable/entries?${params}`);
            if (!Array.isArray(body?.days)) {
                throw new UntisError('timetable: answer without days[]', {code: 'INVALID'});
            }
            return body.days;
        },

        /** the account's homework in the range (`data` of `/api/homeworks/lessons`) */
        async homework(start, end) {
            return (await get(`/api/homeworks/lessons?startDate=${ymd(start)}&endDate=${ymd(end)}`)).data;
        },

        /** a child's absences in the range (`data` of `/api/classreg/absences/students`) */
        async absences(studentId, start, end) {
            const params = `startDate=${ymd(start)}&endDate=${ymd(end)}&studentId=${studentId}&excuseStatusId=-1`;
            return (await get(`/api/classreg/absences/students?${params}`)).data;
        },

        /** exams; refused (code FORBIDDEN) for parent accounts at some schools */
        async exams(studentId, start, end) {
            const params = `startDate=${ymd(start)}&endDate=${ymd(end)}&studentId=${studentId}&klasseId=-1&withGrades=false`;
            return (await get(`/api/exams?${params}`)).data;
        },

        /** the school's messages of the day */
        async news(date) {
            return (await get(`/api/public/news/newsWidgetData?date=${ymd(date)}`)).data;
        },

        async logout() {
            if (!loggedIn) {
                return;
            }
            loggedIn = false;
            try {
                await rpc(`/jsonrpc.do?school=${encodeURIComponent(school)}`, 'logout', {});
            } catch {
                // the session ends on its own anyway
            }
        },
    };
}
