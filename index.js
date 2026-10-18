#!/usr/bin/env node

/**
 * untis2mqtt — WebUntis school timetables -> MQTT, mqtt-smarthome convention, on
 * mqtt-interfaces-core.
 *
 * Scaffold: config, installer and the child naming are in place; the WebUntis client, the
 * timetable model, the items, the alerts and the HTML output follow.
 */

import {createAdapter} from 'mqtt-interfaces-core';

import config from './config.js';
import pkg from './package.json' with {type: 'json'};
import {handle as handleInstall} from './lib/install.js';
import {parseNicknames} from './lib/names.js';
import {createClient} from './lib/untis.js';

handleInstall(config); // --install / --uninstall never reach the rest

const adapter = createAdapter({
    pkg,
    config,
    deviceLabel: 'webuntis',
    info: () => ({server: config.server, school: config.school}),
    onSet: handleSet,
});
const {log} = adapter;

const {invalid} = parseNicknames(config.child);
for (const entry of invalid) {
    log.warn(`ignoring --child ${entry}: expected <student id>=<nickname>`);
}

async function handleSet(parts) {
    switch (parts.join('/')) {
        case 'refresh':
            return poll();
        default:
            throw new Error('unknown item ' + parts.join('/'));
    }
}

async function poll() {
    try {
        createClient(config);
    } catch (error) {
        log.warn(error.message);
    }
}

adapter.start();
poll();
