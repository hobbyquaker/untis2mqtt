# Changelog

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
