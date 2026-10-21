"""Report registration records whose stored values could not be submitted today.

Early submissions predate the current server-side validation (REG-02/SEC-01),
so a handful of rows can still hold values the forms now refuse: a negative or
absurd years-of-experience, a date of birth in the future, an unparseable date,
or a missing mobile number. This lists them; it changes nothing.

Usage:
    python tools/check_registration_data.py [path/to/smf.db] [--csv out.csv]

On the server the database is the volume file, e.g.:
    docker compose exec api sh -c "ls /app/data"          # find smf.db
    docker compose cp api:/app/data/smf.db ./smf-prod.db  # copy it out, then run this
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import sqlite3
import sys

# Matches Services/RegistrationValidator.cs
MAX_YEARS_EXPERIENCE = 70
DATE_FIELDS = ("dateOfBirth", "refereeStartDate", "lastRefereeingDate")
PHONE_FIELDS = ("phone", "applicantPhone")


def problems_in(payload: dict, today: dt.date) -> list[str]:
    found: list[str] = []

    years = payload.get("yearsExperience")
    if years not in (None, ""):
        try:
            value = int(str(years).strip())
            if value < 0:
                found.append(f"yearsExperience is negative ({value})")
            elif value > MAX_YEARS_EXPERIENCE:
                found.append(f"yearsExperience is above {MAX_YEARS_EXPERIENCE} ({value})")
        except ValueError:
            found.append(f"yearsExperience is not a number ({years!r})")

    for field in DATE_FIELDS:
        raw = payload.get(field)
        if not raw:
            continue
        try:
            value = dt.date.fromisoformat(str(raw)[:10])
        except ValueError:
            found.append(f"{field} is not a readable date ({raw!r})")
            continue
        if value > today:
            found.append(f"{field} is in the future ({value.isoformat()})")

    if not any(payload.get(field) for field in PHONE_FIELDS):
        found.append("no mobile number stored")

    return found


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    database = args[0] if args else "backend/Smf.Api/smf.db"
    csv_path = None
    if "--csv" in sys.argv:
        csv_path = sys.argv[sys.argv.index("--csv") + 1]

    today = dt.date.today()
    connection = sqlite3.connect(database)
    rows = connection.execute(
        "select Id, Type, ReferenceNumber, Status, CreatedAt, PayloadJson from Registrations order by Id"
    ).fetchall()

    flagged = []
    for row_id, kind, reference, status, created, raw_payload in rows:
        try:
            payload = json.loads(raw_payload or "{}")
        except json.JSONDecodeError:
            flagged.append((row_id, reference, kind, status, created, "payload is not valid JSON"))
            continue

        issues = problems_in(payload, today)
        if issues:
            flagged.append((row_id, reference, kind, status, str(created)[:10], "; ".join(issues)))

    print(f"{database}: {len(rows)} registration(s), {len(flagged)} with values the forms would now refuse\n")
    for row_id, reference, kind, status, created, issues in flagged:
        print(f"  #{row_id:<4} {reference or '(no reference)':<22} {kind:<8} {status:<20} {created}  {issues}")

    if csv_path:
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.writer(handle)
            writer.writerow(["id", "reference", "type", "status", "created", "problems"])
            writer.writerows(flagged)
        print(f"\nWritten to {csv_path}")

    if flagged:
        print(
            "\nNothing was changed. Correct a record from the admin console "
            "(Memberships > open the request > Edit), which re-validates every field."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
