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
- `--discover --school "<name or town>"` finds a school's server and login name.
