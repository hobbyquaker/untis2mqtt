import {createInstaller} from 'mqtt-interfaces-core';

export const SERVICE = 'untis2mqtt';
export const ENV_PREFIX = 'UNTIS2MQTT';

const installer = createInstaller({
    service: SERVICE,
    envPrefix: ENV_PREFIX,
    description: `${SERVICE} %i - WebUntis to MQTT bridge`,
    documentation: 'https://github.com/hobbyquaker/untis2mqtt',
});

export const {unitFile, envFile, installService, uninstallService, handle} = installer;
