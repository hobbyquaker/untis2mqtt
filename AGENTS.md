# Agent instructions — untis2mqtt

## What this is

untis2mqtt fetches school timetables from WebUntis — with a parent account, for each child — and
publishes them over MQTT: the first and last lesson of a day, whole days as JSON arrays, an HTML view
for dashboards, and alerts when a lesson is cancelled, moved or substituted; homework, exams and
missed lessons too. One of the `xyz2mqtt` adapters by the same author: all follow the
[mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome) architecture and are built on
[mqtt-interfaces-core](https://github.com/hobbyquaker/mqtt-interfaces-core)
(`../mqtt-interfaces-core` when checked out next to this repo — generic fixes go there; its README
is the complete guide to building an adapter). Consistency with the core's conventions and with the
other adapters is a hard requirement. The roadmap is kept in the maintainer's agents repository,
checked out next to this one as `../she-agent/roadmap-items/untis2mqtt/`.

## Status

Scaffold (0.1.0, not released, `private` in package.json until the first release): options, the
installer and the child naming (`lib/names.js`) exist; `lib/untis.js` is a stub.

## Rules specific to this adapter

- **WebUntis has no public API.** The client talks to the internal REST API of the WebUntis web app
  and lives in `lib/untis.js` only; nothing else knows a WebUntis path or field name.
- **Children's names are personal data.** By default a child appears as its nickname or
  `student_<id>`; the real names leave the adapter only with `--child-names firstname|fullname`.
  Never put real names, school names, servers or credentials into tests, fixtures, docs or logs —
  fixtures are real responses with every name, id and text replaced.
- **On the topics values are machine-readable** (ISO 8601 date-times with offset, ISO dates); the
  short display forms (`7:55`, `Mo, 19. Okt`) are for the HTML output and the alert texts only.
- Topics are API: no renames outside a major release.

## Style & practices

Plain JavaScript ESM, 4 spaces, single quotes, eslint + prettier (`npm run lint`, `npm run format`),
`npm test` (`node:test`). Dependencies: `mqtt-interfaces-core` only (`mqtt`, `yargs` come with it);
the HTTP client is `fetch`, the TOTP for `--secret` is `node:crypto`. Pure modules under `lib/` with
a test each.
