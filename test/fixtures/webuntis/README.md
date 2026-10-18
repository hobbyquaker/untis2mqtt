# WebUntis fixtures

Real responses of a school's WebUntis (2026-10, parent accounts), **anonymised**:
every person, teacher, room, class and subject name, every id and every free text is replaced (`T1`, `R3`,
`K5`, `F7`, `Fach 7`, `text 12`, ids from 1001); the school is `Example School`. Dates, times, the time grid,
statuses and the structure are as received.

| File                       | Request                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account-*-appdata.json`   | `GET /WebUntis/api/rest/view/v1/app/data`                                                                                                                         |
| `account-*-timetable.json` | `GET /WebUntis/api/rest/view/v1/timetable/entries?start=…&end=…&format=4&resourceType=STUDENT&resources=<id>&timetableType=MY_TIMETABLE` (3 weeks, with holidays) |
| `account-*-homework.json`  | `GET /WebUntis/api/homeworks/lessons?startDate=…&endDate=…`                                                                                                       |
| `account-*-absences.json`  | `GET /WebUntis/api/classreg/absences/students?startDate=…&endDate=…&studentId=<id>&excuseStatusId=-1`                                                             |
| `account-*-news.json`      | `GET /WebUntis/api/public/news/newsWidgetData?date=…`                                                                                                             |
| `account-*-exams.json`     | `GET /WebUntis/api/exams?…` — **403 "Unerlaubter Zugriff"** for a parent account at this school                                                                   |
