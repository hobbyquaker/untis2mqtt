# untis2mqtt

[![mqtt-smarthome](https://img.shields.io/badge/mqtt-smarthome-blue.svg)](https://github.com/mqtt-smarthome/mqtt-smarthome)
[![npm version](https://img.shields.io/npm/v/untis2mqtt.svg)](https://www.npmjs.com/package/untis2mqtt)
[![License][mit-badge]][mit-url]

> Stundenpläne aus WebUntis über MQTT — wann die erste Stunde beginnt und die letzte endet, heute, morgen
> und am nächsten Schultag, und jede Stunde des Tages als JSON.

[English](README.en.md)

Gebaut auf [mqtt-interfaces-core](https://github.com/hobbyquaker/mqtt-interfaces-core) nach der
[mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome)-Architektur, mit systemd-Installer und
Docker-Image — wie die anderen `xyz2mqtt`-Adapter.

**0.x ist eine Vorschau.** Benachrichtigungen bei Ausfall und Vertretung, eine HTML-Ansicht für Dashboards
und Home-Assistant-Discovery folgen in späteren Versionen. Bis 1.0 können sich Topics noch ändern.

## Wofür

- ein Wecker, der dem Stundenplan folgt: `untis/status/<kind>/next/start` ist die erste Stunde des nächsten
  Schultags, die tatsächlich stattfindet — eine ausfallende erste Stunde verschiebt ihn, Ferien überspringt er;
- "Aus dem Haus", "Abholen um", Heizung oder Licht nach `today/start` und `today/end`;
- ein Wecker für den ganzen Haushalt: `untis/status/all/next/start` ist der früheste Beginn aller Kinder;
- Dashboards und Skripte: die Stunden des Tages als JSON-Array, die laufende und die nächste Stunde.

## Installation

```
sudo npm install -g untis2mqtt
```

Server und Login-Namen der Schule finden:

```
$ untis2mqtt --discover --school "Name oder Ort der Schule"
example.webuntis.com  --school example-school  Beispielschule  (12345, Ort, Straße 1)
```

Dann mit dem WebUntis-Login starten (Eltern- oder Schülerzugang):

```
untis2mqtt -s example.webuntis.com --school example-school --username <benutzer> --password <passwort> -u mqtt://broker
```

Als systemd-Dienst (legt `untis2mqtt@untis`, einen eigenen Benutzer und `/etc/untis2mqtt/untis.env` mit den
Optionen an):

```
sudo untis2mqtt --install -n untis -s example.webuntis.com --school example-school \
    --username <benutzer> --password <passwort> -u mqtt://broker
```

Docker:

```
docker run -d --name untis2mqtt \
    -e UNTIS2MQTT_MQTT_URL=mqtt://broker -e UNTIS2MQTT_SERVER=example.webuntis.com \
    -e UNTIS2MQTT_SCHOOL=example-school -e UNTIS2MQTT_USERNAME=<benutzer> -e UNTIS2MQTT_PASSWORD=<passwort> \
    ghcr.io/hobbyquaker/untis2mqtt
```

### Mehrere Accounts

Eltern haben oft einen WebUntis-Zugang pro Kind. Diese kommen in eine JSON-Datei, die mit `--accounts-file`
übergeben wird; alle Kinder teilen sich dann eine Instanz und einen Topic-Baum:

```json
[
  {"username": "eltern_kind1", "password": "…"},
  {"username": "eltern_kind2", "password": "…"}
]
```

Die Datei sollte nur für den Dienst lesbar sein (`/etc/untis2mqtt/`, Modus `0640`, Gruppe `untis2mqtt`).

### Schulen mit Single Sign-on

Wer sich über IServ, Office 365 o. ä. bei WebUntis anmeldet, hat kein WebUntis-Passwort. Dann wird das
App-Secret verwendet: in WebUntis das Profil öffnen → Freigaben → den QR-Code für die App anzeigen; der
`key=`-Teil des Links dahinter ist das Secret. Es wird als `--secret` (oder `"secret"` in der Account-Datei)
statt des Passworts angegeben.

## Optionen

| Option                     | Standard        |                                                                                                                         |
| -------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `-s, --server`             | —               | WebUntis-Server der Schule (siehe `--discover`)                                                                         |
| `--school`                 | —               | Login-Name der Schule; mit `--discover` der gesuchte Name oder Ort                                                      |
| `--username`, `--password` | —               | ein WebUntis-Login                                                                                                      |
| `--secret`                 | —               | das App-Secret statt des Passworts (Single Sign-on)                                                                     |
| `--accounts-file`          | —               | JSON-Datei mit mehreren Logins (siehe oben)                                                                             |
| `--child`                  | —               | ein Spitzname pro Kind: `--child 1234=anna 5678=ben` (die IDs stehen beim Start im Log)                                 |
| `--child-names`            | `nickname`      | wie ein Kind in den Topics heißt: `nickname`, `firstname`, `fullname` oder `id`                                         |
| `--publish`                | alle            | zu veröffentlichende Gruppen: `day`, `live`, `timetable`, `week`, `homework`, `exams`, `absences`, `messages`, `school` |
| `--days`                   | `14`            | Tage im Voraus für Hausaufgaben und den nächsten Schultag (der Stundenplan wird für mindestens 21 Tage abgerufen)       |
| `--timezone`               | `Europe/Berlin` | Zeitzone der Schule, für die veröffentlichten Zeiten                                                                    |
| `--poll-interval`          | `900`           | Sekunden zwischen den Abrufen tagsüber                                                                                  |
| `--poll-interval-morning`  | `300`           | Sekunden zwischen den Abrufen 6:00–8:00 an Schultagen                                                                   |
| `--poll-interval-night`    | `3600`          | Sekunden zwischen den Abrufen 22:00–5:30                                                                                |

Dazu die Optionen, die jeder `xyz2mqtt`-Adapter hat (`-u` Broker-URL, `-n` Name, `--json-payloads`, `-v`,
`--install`, …): `untis2mqtt --help`. Jede Option geht auch als Umgebungsvariable `UNTIS2MQTT_<OPTION>`.

## Topics

`untis` ist der Standard-Instanzname (`-n`). Status-Topics sind retained und tragen `{"val": …, "ts": …, "lc": …}`
(oder den reinen Wert mit `--no-json-payloads`). Zeiten sind ISO 8601 mit dem Zeitversatz der Schule, Daten
sind ISO-Daten, `null` heißt "keins" (keine erste Stunde an einem freien Tag).

| Topic                                                    | Wert                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `untis/connected`                                        | `2` solange WebUntis antwortet, `1` wenn nicht, `0` wenn der Adapter nicht läuft                                 |
| `untis/status/<kind>/<tag>/date`                         | `"2026-10-19"`                                                                                                   |
| `untis/status/<kind>/<tag>/school`                       | `true`, wenn mindestens eine Stunde stattfindet                                                                  |
| `untis/status/<kind>/<tag>/start`                        | erste Stunde, die stattfindet, `"2026-10-19T07:40:00+02:00"`                                                     |
| `untis/status/<kind>/<tag>/end`                          | letzte Stunde, die stattfindet                                                                                   |
| `untis/status/<kind>/<tag>/start_planned`, `end_planned` | dasselbe laut regulärem Stundenplan (ausfallende Stunden zählen mit)                                             |
| `untis/status/<kind>/<tag>/lessons`                      | Anzahl der Stunden, die stattfinden                                                                              |
| `untis/status/<kind>/<tag>/changes`                      | Anzahl ausfallender, geänderter, zusätzlicher oder verlegter Stunden                                             |
| `untis/status/<kind>/<tag>/timetable`                    | alle Stunden des Tages als JSON-Array (unten)                                                                    |
| `untis/status/<kind>/in_school`                          | `true` zwischen der ersten und letzten Stunde von heute                                                          |
| `untis/status/<kind>/now`                                | die Stunde, die gerade läuft, oder `null`                                                                        |
| `untis/status/<kind>/next_lesson`                        | die nächste Stunde, die stattfindet                                                                              |
| `untis/status/<kind>/last_update`                        | Zeit des letzten erfolgreichen Abrufs                                                                            |
| `untis/status/all/<tag>/…`                               | bei mehreren Kindern: frühester Beginn, spätestes Ende, Schule, wenn irgendein Kind Schule hat                   |
| `untis/status/<kind>/week`                               | die Woche des nächsten Schultags (nach der letzten Stunde am Freitag die folgende): `{"monday", "days": [Tag…]}` |
| `untis/status/<kind>/week/next`                          | die Woche danach                                                                                                 |
| `untis/status/<kind>/homework`                           | Hausaufgaben von zwei Wochen zurück bis `--days` voraus (JSON-Array, unten)                                      |
| `untis/status/<kind>/homework/open`                      | Anzahl offener Hausaufgaben (nicht erledigt, nicht überfällig)                                                   |
| `untis/status/<kind>/homework/due_tomorrow`              | Anzahl offener Hausaufgaben, die morgen fällig sind                                                              |
| `untis/status/<kind>/exams`                              | Klassenarbeiten und Prüfungen im Zeitraum (JSON-Array)                                                           |
| `untis/status/<kind>/exams/next`                         | die nächste Prüfung oder `null`                                                                                  |
| `untis/status/<kind>/absences`                           | Fehlzeiten des Schuljahres (JSON-Array, unten)                                                                   |
| `untis/status/<kind>/absences/count`                     | Anzahl der Fehlzeiten                                                                                            |
| `untis/status/<kind>/absences/unexcused`                 | Anzahl nicht entschuldigter Fehlzeiten                                                                           |
| `untis/status/<kind>/messages`                           | Nachrichten im WebUntis-Posteingang des Accounts (Liste mit Vorschau)                                            |
| `untis/status/<kind>/messages/unread`                    | Anzahl ungelesener Nachrichten                                                                                   |
| `untis/status/school/school_year`                        | Schuljahr: Name, Beginn, Ende                                                                                    |
| `untis/status/school/time_grid`                          | Stundenraster: Stunde, Beginn, Ende                                                                              |
| `untis/status/school/holidays`                           | kommende Ferien laut WebUntis (Name, Beginn, Ende)                                                               |
| `untis/status/school/news`                               | Tagesnachrichten der Schule                                                                                      |
| `untis/set/refresh`                                      | jetzt abrufen                                                                                                    |

`<tag>` ist `today`, `tomorrow` oder `next` — der nächste Schultag, der noch nicht vorbei ist: nach der
letzten Stunde rückt er weiter, und er überspringt Wochenenden, Ferien und Tage, an denen alles ausfällt. Gibt
es innerhalb von `--days` keinen Schultag, ist `next/date` `null` und `next/school` `false`.

Eine Stunde:

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

`status` ist `regular`, `changed`, `cancelled`, `additional`, `exam` oder `event`; `periods` sind die Stunden
des Zeitrasters der Schule, die die Stunde abdeckt (eine Doppelstunde hat zwei); `notes` die Notiz für alle,
`homework` ob zu der Stunde Hausaufgaben eingetragen sind, `color` die Fachfarbe aus WebUntis.

Ein Tag in `week/…`: die Felder der Tages-Topics (`date`, `school`, `start`, `end`, `start_planned`,
`end_planned`, `lessons`, `changes`, `holiday`) und `timetable` mit seinen Stunden. Montag bis Freitag, Samstag
und Sonntag nur, wenn dort Unterricht ist — gedacht für Wochenansichten in Dashboards.

Eine Hausaufgabe: `{"assigned", "due", "subject", "teacher", "text", "remark", "completed", "attachments"}`.
Eine Fehlzeit: `{"date", "start", "end", "reason", "text", "excused", "excuse_status"}`. Eine Nachricht:
`{"sent", "subject", "preview", "sender", "read", "attachments"}` — nur die Liste; der Inhalt wird nicht
abgerufen, weil WebUntis die Nachricht dann als gelesen markieren könnte.

**Klassenarbeiten:** Viele Schulen geben die Prüfungsliste für Eltern nicht frei (WebUntis antwortet
"Unerlaubter Zugriff"). untis2mqtt fragt sie einmal ab und nimmt sonst die Prüfungen, die im Stundenplan als
solche eingetragen sind. Ist beides leer, bleibt `exams` leer. Was eine Schule nicht freigibt (Hausaufgaben,
Fehlzeiten, Nachrichten), wird einmal im Log gemeldet und nicht veröffentlicht.

### Beispiele

Weckzeit 70 Minuten vor der ersten Stunde, in she (`smart-home-engine`):

```js
she.mqtt.sub('untis/status/anna/next/start', {change: true}, (topic, val) => {
  if (!val) return; // kein Schultag in Sicht
  const wake = new Date(Date.parse(val) - 70 * 60 * 1000);
  she.log('Wecken um', wake.toLocaleTimeString());
});
```

In Home Assistant, bis die Discovery kommt, ein Sensor von Hand:

```yaml
mqtt:
  sensor:
    - name: Anna Schulbeginn
      state_topic: untis/status/anna/next/start
      value_template: '{{ value_json.val }}'
      device_class: timestamp
```

## Datenschutz

Die Stundenpläne der Kinder landen retained auf dem Broker: Fächer, Lehrerkürzel, Räume — und, wenn nicht
mit `--publish` abgewählt, Hausaufgaben, Fehlzeiten mit Gründen und die Vorschau der Nachrichten. Wer `untis/#` lesen
darf, sollte über die ACLs des Brokers geregelt werden. Kinder erscheinen standardmäßig unter einem Spitznamen
oder als `student_<id>`; ihre echten Namen nur mit `--child-names firstname` oder `fullname`. Die Zugangsdaten
kommen aus den Optionen oder der Account-Datei und werden nie geloggt.

## Wie es funktioniert

WebUntis hat keine öffentliche Schnittstelle für Eltern und Schüler. untis2mqtt nutzt die Schnittstelle, die
die WebUntis-Web-App selbst verwendet (ein Login, dann die REST-API der App), wie andere WebUntis-Werkzeuge
auch. Untis kann sie ohne Ankündigung ändern; sie steckt in einem Modul (`lib/untis.js`), damit eine Änderung
schnell nachgezogen werden kann.

## Danke

Der WebUntis-Client folgt [MMM-Webuntis](https://github.com/HeikoGr/MMM-Webuntis) (MIT) von HeikoGr, dessen
Umgang mit der Schnittstelle der Web-App — Login, Token, Sitzungen, die mit einer Login-Seite enden — den Weg
gezeigt hat.

## Lizenz

MIT © [Sebastian Raff](https://github.com/hobbyquaker)

untis2mqtt steht in keiner Verbindung zur Untis GmbH.

[mit-badge]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat
[mit-url]: LICENSE
