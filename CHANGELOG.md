# Changelog

## 0.1.0

Not released.

- Scaffold: options, the systemd installer, the child naming.
- WebUntis client: password or app-secret login, several accounts (`--accounts-file`), sessions renewed
  before they expire and after WebUntis drops them, retries on server errors; timetable, homework,
  absences, exams, messages of the day.
- Timetable model: lessons with periods, status (regular, changed, cancelled, additional, exam, event),
  what changed (teacher, room, subject), texts; day summaries with the first and last lesson that take
  place and the planned ones; today, tomorrow and the next school day; `--timezone` for the offsets.
- MQTT items per child: `today`, `tomorrow` and `next` (the next school day) with date, school,
  start, end, planned start and end, lessons, changes and the day's lessons as a JSON array; `in_school`,
  `now`, `next_lesson`, `last_update`; `all/…` across the children. `--publish` switches groups off;
  items no longer published are cleared. Fetches on a schedule (`--poll-interval`, `-morning`, `-night`)
  and on `<name>/set/refresh`.
- `--discover --school "<name or town>"` finds a school's server and login name.
