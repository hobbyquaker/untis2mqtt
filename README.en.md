# untis2mqtt

[![mqtt-smarthome](https://img.shields.io/badge/mqtt-smarthome-blue.svg)](https://github.com/mqtt-smarthome/mqtt-smarthome)
[![npm version](https://img.shields.io/npm/v/untis2mqtt.svg)](https://www.npmjs.com/package/untis2mqtt)
[![CI](https://github.com/hobbyquaker/untis2mqtt/actions/workflows/ci.yml/badge.svg)](https://github.com/hobbyquaker/untis2mqtt/actions/workflows/ci.yml)
[![License][mit-badge]][mit-url]

> School timetables from WebUntis via MQTT — when the first lesson starts and the last one ends,
> today, tomorrow and on the next school day, and every lesson of the day as JSON.

[Deutsch](README.md)

Built on [mqtt-interfaces-core](https://github.com/hobbyquaker/mqtt-interfaces-core), following the
[mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome) architecture, with a systemd installer
and a Docker image — like the other `xyz2mqtt` adapters.

**0.x is a preview.** Alerts on cancelled and substituted lessons, an HTML view for dashboards and Home
Assistant discovery follow in later releases. Topics may still change before 1.0.

## What it is for

- a wake-up alarm that follows the timetable: `untis/status/<child>/next/start` is the first lesson of the next
  school day that actually takes place — a cancelled first lesson moves it, a holiday skips the day;
- "leave the house", "pick up at", heating or lights by `today/start` and `today/end`;
- one alarm for the whole household: `untis/status/all/next/start` is the earliest of all children;
- dashboards and scripts: the day's lessons as a JSON array, the current and the next lesson.

## Install

```
sudo npm install -g untis2mqtt
```

Find your school's server and login name:

```
$ untis2mqtt --discover --school "name or town of the school"
example.webuntis.com  --school example-school  Example School  (12345, Town, Street 1)
```

Then run it with your WebUntis login (a parent or a student account):

```
untis2mqtt -s example.webuntis.com --school example-school --username <user> --password <password> -u mqtt://broker
```

As a systemd service (creates `untis2mqtt@untis`, an unprivileged user, and `/etc/untis2mqtt/untis.env` with
the options):

```
sudo untis2mqtt --install -n untis -s example.webuntis.com --school example-school \
    --username <user> --password <password> -u mqtt://broker
```

Docker:

```
docker run -d --name untis2mqtt \
    -e UNTIS2MQTT_MQTT_URL=mqtt://broker -e UNTIS2MQTT_SERVER=example.webuntis.com \
    -e UNTIS2MQTT_SCHOOL=example-school -e UNTIS2MQTT_USERNAME=<user> -e UNTIS2MQTT_PASSWORD=<password> \
    ghcr.io/hobbyquaker/untis2mqtt
```

### Several accounts

Parents often have one WebUntis account per child. Put them into one JSON file and pass it with
`--accounts-file`; all children then share one instance and one topic tree:

```json
[
  {"username": "parent_child1", "password": "…"},
  {"username": "parent_child2", "password": "…"}
]
```

Keep the file readable for the service only (`/etc/untis2mqtt/`, mode `0640`, group `untis2mqtt`).

### Schools with single sign-on

If you log in to WebUntis through IServ, Office 365 or similar, there is no WebUntis password. Use the app
secret instead: in WebUntis open your profile → Data access ("Freigaben") → show the QR code for the app; the
`key=` part of the link behind it is the secret. Pass it as `--secret` (or `"secret"` in the accounts file)
instead of the password.

## Options

| Option                     | Default         |                                                                                                           |
| -------------------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| `-s, --server`             | —               | WebUntis server of the school (see `--discover`)                                                          |
| `--school`                 | —               | login name of the school; with `--discover` the name or town to search for                                |
| `--username`, `--password` | —               | one WebUntis login                                                                                        |
| `--secret`                 | —               | the app secret instead of the password (single sign-on)                                                   |
| `--accounts-file`          | —               | JSON file with several logins (see above)                                                                 |
| `--child`                  | —               | a nickname per child: `--child 1234=anna 5678=ben` (the ids are logged on start)                          |
| `--child-names`            | `nickname`      | what names a child in the topics: `nickname`, `firstname`, `fullname` or `id`                             |
| `--publish`                | all             | item groups to publish: `day`, `live`, `timetable`, `homework`, `exams`, `absences`, `messages`, `school` |
| `--days`                   | `14`            | days ahead to fetch                                                                                       |
| `--timezone`               | `Europe/Berlin` | time zone of the school, for the published times                                                          |
| `--poll-interval`          | `900`           | seconds between fetches during the day                                                                    |
| `--poll-interval-morning`  | `300`           | seconds between fetches 06:00–08:00 on school days                                                        |
| `--poll-interval-night`    | `3600`          | seconds between fetches 22:00–05:30                                                                       |

Plus the options every `xyz2mqtt` adapter has (`-u` broker url, `-n` name, `--json-payloads`, `-v`, `--install`,
…): `untis2mqtt --help`. Every option can also be given as an environment variable, `UNTIS2MQTT_<OPTION>`.

## Topics

`untis` is the default instance name (`-n`). Status topics are retained and carry
`{"val": …, "ts": …, "lc": …}` (or the plain value with `--no-json-payloads`). Times are ISO 8601 with the
school's offset, dates are ISO dates, `null` means "none" (no first lesson on a day off).

| Topic                                                     | Value                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `untis/connected`                                         | `2` while WebUntis answers, `1` when it does not, `0` when the adapter is down |
| `untis/status/<child>/<day>/date`                         | `"2026-10-19"`                                                                 |
| `untis/status/<child>/<day>/school`                       | `true` if at least one lesson takes place                                      |
| `untis/status/<child>/<day>/start`                        | first lesson that takes place, `"2026-10-19T07:40:00+02:00"`                   |
| `untis/status/<child>/<day>/end`                          | last lesson that takes place                                                   |
| `untis/status/<child>/<day>/start_planned`, `end_planned` | the same per the regular timetable (cancelled lessons count)                   |
| `untis/status/<child>/<day>/lessons`                      | number of lessons that take place                                              |
| `untis/status/<child>/<day>/changes`                      | number of cancelled, changed, extra or moved lessons                           |
| `untis/status/<child>/<day>/timetable`                    | all lessons of the day as a JSON array (below)                                 |
| `untis/status/<child>/in_school`                          | `true` between today's first and last lesson                                   |
| `untis/status/<child>/now`                                | the lesson taking place now, or `null`                                         |
| `untis/status/<child>/next_lesson`                        | the next lesson that takes place                                               |
| `untis/status/<child>/last_update`                        | time of the last successful fetch                                              |
| `untis/status/all/<day>/…`                                | with several children: earliest start, latest end, school if any child has     |
| `untis/status/<child>/homework`                           | homework from two weeks back to `--days` ahead (JSON array, below)             |
| `untis/status/<child>/homework/open`                      | number of open homework (not done, not overdue)                                |
| `untis/status/<child>/homework/due_tomorrow`              | number of open homework due tomorrow                                           |
| `untis/status/<child>/exams`                              | exams in the range (JSON array)                                                |
| `untis/status/<child>/exams/next`                         | the next exam or `null`                                                        |
| `untis/status/<child>/absences`                           | the school year's absences (JSON array, below)                                 |
| `untis/status/<child>/absences/count`                     | number of absences                                                             |
| `untis/status/<child>/absences/unexcused`                 | number of absences not excused                                                 |
| `untis/status/<child>/messages`                           | the account's WebUntis inbox (list with previews)                              |
| `untis/status/<child>/messages/unread`                    | number of unread messages                                                      |
| `untis/status/school/school_year`                         | school year: name, start, end                                                  |
| `untis/status/school/time_grid`                           | time grid: period, start, end                                                  |
| `untis/status/school/holidays`                            | holidays to come as WebUntis lists them (name, start, end)                     |
| `untis/status/school/news`                                | the school's messages of the day                                               |
| `untis/set/refresh`                                       | fetch now                                                                      |

`<day>` is `today`, `tomorrow` or `next` — the next school day that is not over yet: after the last lesson it
moves on, and it skips weekends, holidays and days on which every lesson is cancelled. Within `--days` without
a school day, `next/date` is `null` and `next/school` is `false`.

A lesson:

```json
{
  "date": "2026-10-19",
  "start": "2026-10-19T07:40:00+02:00",
  "end": "2026-10-19T09:15:00+02:00",
  "period": 1,
  "periods": [1, 2],
  "subject": "M",
  "subject_long": "Mathematik",
  "teacher": ["Sch"],
  "room": ["211"],
  "class": ["5b"],
  "group": [],
  "status": "changed",
  "moved": false,
  "changes": {"teacher": {"from": ["Mül"], "to": ["Sch"]}, "room": {"from": ["104"], "to": ["211"]}},
  "text": "Vertretung",
  "info": "",
  "notes": "",
  "homework": false,
  "color": "#80ff00"
}
```

`status` is `regular`, `changed`, `cancelled`, `additional`, `exam` or `event`; `periods` are the periods of
the school's time grid the lesson covers (a double lesson has two); `notes` the note for everyone, `homework`
whether homework is entered for the lesson, `color` the subject's colour in WebUntis.

Homework: `{"assigned", "due", "subject", "teacher", "text", "remark", "completed", "attachments"}`. An absence:
`{"date", "start", "end", "reason", "text", "excused", "excuse_status"}`. A message: `{"sent", "subject",
"preview", "sender", "read", "attachments"}` — the list only; the body is not fetched, because WebUntis may then
mark the message read.

**Exams:** many schools do not let parents see the exam list (WebUntis answers "access denied"). untis2mqtt
asks once and otherwise takes the exams entered as such in the timetable; when both are empty, `exams` is
empty. What a school does not allow (homework, absences, messages) is logged once and not published.

### Examples

A wake-up time 70 minutes before the first lesson, in she (`smart-home-engine`):

```js
she.mqtt.sub('untis/status/anna/next/start', {change: true}, (topic, val) => {
  if (!val) return; // no school day ahead
  const wake = new Date(Date.parse(val) - 70 * 60 * 1000);
  she.log('wake up at', wake.toLocaleTimeString());
});
```

In Home Assistant, until discovery arrives, a sensor by hand:

```yaml
mqtt:
  sensor:
    - name: Anna school starts
      state_topic: untis/status/anna/next/start
      value_template: '{{ value_json.val }}'
      device_class: timestamp
```

## Privacy

The children's timetables end up on your broker, retained: subjects, teachers' abbreviations, rooms — and,
unless switched off with `--publish`, homework, absences with their reasons and the message previews. Restrict
who may read `untis/#` with your broker's ACLs. Children are published under a nickname or `student_<id>` by
default; their real names appear only with `--child-names firstname` or `fullname`. The login is read from
the options or the accounts file and never logged.

## How it works

WebUntis has no public API for parents and students. untis2mqtt talks to the interface the WebUntis web app
itself uses (a login, then the app's REST API), like other WebUntis tools do. Untis may change it without
notice; it is kept in one module (`lib/untis.js`) so a change can be followed quickly.

## Credits

The WebUntis client follows [MMM-Webuntis](https://github.com/HeikoGr/MMM-Webuntis) (MIT) by HeikoGr, whose
handling of the web app's interface — the login, the token, sessions that end with a login page — showed the way.

## License

MIT © [Sebastian Raff](https://github.com/hobbyquaker)

untis2mqtt is not affiliated with Untis GmbH.

[mit-badge]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat
[mit-url]: LICENSE
