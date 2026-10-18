import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

process.env.UNTIS2MQTT_MQTT_URL ||= 'mqtt://test';
process.env.UNTIS2MQTT_SERVER ||= 'example.webuntis.com';
process.env.UNTIS2MQTT_SCHOOL ||= 'example';
const {unitFile, envFile} = await import('../lib/install.js');
const {OPTIONS} = await import('../config.js');
const {SHARED_OPTIONS, configSchema} = await import('mqtt-interfaces-core');
const pkg = (await import('../package.json', {with: {type: 'json'}})).default;

describe('install', () => {
    test('unit uses the shared layout, with no extra privileges', () => {
        const unit = unitFile('/usr/bin/node /usr/local/lib/node_modules/untis2mqtt/index.js');
        assert.doesNotMatch(unit, /SupplementaryGroups/);
        assert.match(unit, /^EnvironmentFile=\/etc\/untis2mqtt\/%i\.env$/m);
        assert.match(unit, /^Environment=UNTIS2MQTT_NAME=%i$/m);
        assert.match(unit, /^Restart=always$/m);
    });

    test('env file carries the adapter options', () => {
        const argv = {name: 'untis', server: 'example.webuntis.com', school: 'example', child: ['1=a', '2=b']};
        Object.defineProperty(argv, '$options', {value: {...OPTIONS, ...SHARED_OPTIONS}});
        const out = envFile(argv);
        assert.match(out, /^UNTIS2MQTT_SERVER=example\.webuntis\.com$/m);
        assert.match(out, /^UNTIS2MQTT_SCHOOL=example$/m);
        assert.doesNotMatch(out, /^UNTIS2MQTT_NAME=/m);
    });

    test('config schema: credentials are secret', () => {
        const schema = configSchema({pkg, envPrefix: 'UNTIS2MQTT', options: OPTIONS, defaults: {name: 'untis'}});
        const p = schema.properties;
        assert.equal(p.password['x-secret'], true);
        assert.equal(p.secret['x-secret'], true);
        assert.equal(p.username['x-secret'], undefined);
        assert.deepEqual(schema.required.sort(), ['school', 'server']);
        assert.equal(p.child_names?.default ?? p['child-names']?.default, 'nickname');
    });
});
