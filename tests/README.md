# Tests

Two kinds, because they cost very different amounts to run.

## `logic/` — the algorithms, on their own

`DrawBuilder` and `BoutScheduler` are pure logic: no database, no API, no
clock. They are also the two pieces most worth getting exactly right, because
a wrong bracket or a double-booked athlete is discovered on a competition day
with people standing around.

The production sources are **linked** into the test project rather than
copied, so the tests can never be about an old version of the code.

```bash
cd tests/logic
dotnet run
```

Covers, rule by rule against the signed Phase 3 document:

- **REQ-10** — bracket sizes and bye counts from 2 to 64 athletes, every
  athlete drawn once, nobody fighting twice before everybody has fought once,
  byes advancing, a complete connected tree, round names including
  "Preliminary", no third-place bout, club separation across 200 draws, and
  reproducibility from a seed so a draw can be re-run in a dispute.
- **REQ-11** — per-ring start times and intervals, a division running to its
  own start time and interval over its ring's, the document's own
  bout-numbering example, lightest division first, a pinned bout surviving a
  regeneration, and the three athlete-safety rules.

## `api/` — the journey, against a running API

These drive a real API over HTTP against a throwaway SQLite file, from
creating a tournament through to a published schedule, and then the three
member portals.

```bash
tests/run-api-tests.sh
```

The script builds the API, starts it on a spare port with its own database and
outbox, runs both suites, and stops it again. It needs Python 3 — no packages
beyond the standard library.

- `test_phase3.py` — REQ-01 to REQ-11: setup, divisions, eligibility, entry,
  check-in, examination, weigh-in, the draw, withdrawal, rings and the running
  order.
- `test_accounts.py` — REQ-04 to REQ-07: the medical file, invitations and
  activation, the club, coach and athlete portals, and the separation between
  a member's token and the console's.
- `test_gaps.py` — the rules that were implied rather than operable until the
  second pass: extending the two type lists and running a tournament on an
  added type, picking which weight classes a tournament runs, the guardian
  consent form as a document, swapping two corners, and a division with its
  own start time and interval.

Each check prints `PASS` or `FAIL` with what it actually saw, and the run ends
with `FAILED: none` or the names of what broke. The exit code follows. Set
`SMF_TEST_LOG` to keep a copy of a run.

The three suites share one database, each building its own tournaments and
athletes, so the order they run in does not matter and a run can be repeated
against a database that has already been used.

## What is not here

- The browser checks. They were run against the console and the portal in
  English and Arabic, but they need Playwright and a dev server, which is more
  than a test suite should assume. Worth adding once there is somewhere to run
  them.
- `QrCode` was checked module for module against an independent encoder while
  it was written — every mask, every version in range. That comparison needs
  the `qrcode` Python package; it is not part of the normal run.
