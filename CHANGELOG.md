# Changelog

## 0.3.0

- **Week topics** for dashboards: `<child>/week`, the week of the next school day (after Friday's last
  lesson the following one), and `<child>/week/next`, the week after — the Monday and the days Monday to
  Friday (Saturday and Sunday when they have lessons), each with its summary and its lessons. The
  timetable is fetched for at least 21 days for them.
- untis2mqtt publishes data only; views belong to the dashboards (a feezal widget is planned).

**Upgrading an installed 0.1.0 or 0.2.0:** add `week` to `UNTIS2MQTT_PUBLISH` in `/etc/untis2mqtt/<name>.env`, or
delete the line to publish all groups.

## 0.2.0

Everything else WebUntis gives a parent or student account, each on a JSON topic of its own.

- **Homework**: `<child>/homework` (two weeks back to `--days` ahead) with subject, teacher, text, due date
  and whether it is done; `homework/open`, `homework/due_tomorrow`.
- **Exams**: `<child>/exams` and `exams/next` — from WebUntis' exam list where the school allows it, otherwise
  the exams entered in the timetable. Many schools refuse the list to parents; untis2mqtt then asks only
  once.
- **Absences**: `<child>/absences` for the school year with times, reason and whether excused;
  `absences/count`, `absences/unexcused`.
- **Messages**: `<child>/messages`, the account's WebUntis inbox as a list with previews (the bodies are not
  fetched, so nothing is marked read); `messages/unread`.
- **School**: `school/school_year`, `school/time_grid`, `school/holidays` (those to come),
  `school/news` (messages of the day).
- Lessons carry `notes` (the note for everyone), `homework` (homework entered for the lesson) and `color`
  (the subject's colour in WebUntis).
- What a school refuses an account is logged once and left out; a failed fetch keeps the last values.
- The README is German now, the English one is `README.en.md`.

**Upgrading an installed 0.1.0:** `--install` wrote the item groups of 0.1.0 into
`/etc/untis2mqtt/<name>.env`. Add the new ones —
`UNTIS2MQTT_PUBLISH=day,live,timetable,homework,exams,absences,messages,school` — or delete the line to
publish all groups.

## 0.1.0

First release, a preview: school timetables from WebUntis on MQTT.

- Per child: `today`, `tomorrow` and `next` — the next school day that is not over yet — with the date,
  whether there is school, the first and last lesson that take place and the planned ones, the number of
  lessons and of changes, and the day's lessons as a JSON array; `in_school`, `now`, `next_lesson`,
  `last_update`; with several children `all/…`, the household's earliest start and latest end.
- Lessons carry their periods (a double lesson has two), a status (regular, changed, cancelled, additional,
  exam, event), what changed (teacher, room, subject — from and to) and the substitution text.
- Login with a password, or with the app secret for schools with single sign-on; several accounts in one
  instance (`--accounts-file`), as parents often have one account per child.
- `--discover --school "<name or town>"` finds a school's server and login name.
- Children appear under a nickname or `student_<id>` unless `--child-names` asks for their names.
- Fetches every 15 minutes, every 5 on school mornings, hourly at night, and on `<name>/set/refresh`;
  `--timezone` for the published times.
- Not yet: alerts on changes, an HTML view, homework, exams and absences, Home Assistant discovery.
