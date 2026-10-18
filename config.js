import {parseConfig} from 'mqtt-interfaces-core';

import pkg from './package.json' with {type: 'json'};

/** item groups --publish can switch; all on by default */
export const GROUPS = [
    'day',
    'live',
    'timetable',
    'html',
    'changes',
    'alerts',
    'homework',
    'exams',
    'absences',
    'news',
];

export const OPTIONS = {
    server: {
        alias: 's',
        type: 'string',
        describe: 'webuntis server host of the school, e.g. example.webuntis.com',
        demandOption: true,
    },
    school: {
        type: 'string',
        describe: 'school login name as in the webuntis url (school=...)',
        demandOption: true,
    },
    username: {
        type: 'string',
        describe: 'webuntis user, usually the parent account',
    },
    password: {
        type: 'string',
        describe: 'password of the webuntis user',
        secret: true,
    },
    secret: {
        type: 'string',
        describe: 'app secret from the webuntis data access qr code (schools with sso login); replaces --password',
        secret: true,
    },
    child: {
        type: 'array',
        describe: 'nickname per child as <student id>=<nickname>; the ids are logged on start',
        default: [],
    },
    'child-names': {
        type: 'string',
        describe: 'what names a child in topics, html and alert texts',
        choices: ['nickname', 'firstname', 'fullname', 'id'],
        default: 'nickname',
    },
    publish: {
        type: 'array',
        describe: `item groups to publish (${GROUPS.join(', ')})`,
        default: GROUPS,
    },
    days: {
        type: 'number',
        describe: 'days ahead to fetch, watch for changes and publish',
        default: 14,
    },
    lang: {
        type: 'string',
        describe: 'language of the html output and the alert texts',
        choices: ['de', 'en'],
        default: 'de',
    },
    'poll-interval': {
        type: 'number',
        describe: 'seconds between fetches during the day',
        default: 900,
    },
    'poll-interval-morning': {
        type: 'number',
        describe: 'seconds between fetches from 06:00 to 08:00 on school days, when substitutions are published',
        default: 300,
    },
    'poll-interval-night': {
        type: 'number',
        describe: 'seconds between fetches from 22:00 to 05:30',
        default: 3600,
    },
    'alert-bulk': {
        type: 'number',
        describe: 'more changes than this per child and fetch become one timetable_changed alert',
        default: 8,
    },
};

export default parseConfig({
    pkg,
    options: OPTIONS,
    defaults: {name: 'untis'},
    examples: [
        ['$0 -s example.webuntis.com --school example --username parent -u mqtt://broker', 'run in the foreground'],
        [
            'sudo $0 --install -n untis -s example.webuntis.com --school example --username parent -u mqtt://broker',
            'install as service untis2mqtt@untis',
        ],
    ],
});
