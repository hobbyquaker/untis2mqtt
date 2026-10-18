# untis2mqtt

[![mqtt-smarthome](https://img.shields.io/badge/mqtt-smarthome-blue.svg)](https://github.com/mqtt-smarthome/mqtt-smarthome)
[![License][mit-badge]][mit-url]

> School timetables from WebUntis via MQTT — first and last lesson, whole days, changes and
> cancellations, homework, exams and missed lessons.

**Work in progress — not released, not usable yet.**

Built on [mqtt-interfaces-core](https://github.com/hobbyquaker/mqtt-interfaces-core), following the
[mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome) architecture, like the other
`xyz2mqtt` adapters.

## Credits

The WebUntis client follows [MMM-Webuntis](https://github.com/HeikoGr/MMM-Webuntis) (MIT) by HeikoGr, whose
handling of the web app's interface — the login, the token, sessions that end with a login page — showed the way.

## License

MIT © [Sebastian Raff](https://github.com/hobbyquaker)

untis2mqtt is not affiliated with Untis GmbH. It uses the same interface as the WebUntis web app,
which is not a public API and may change without notice.

[mit-badge]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat
[mit-url]: LICENSE
