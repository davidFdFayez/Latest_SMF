# Phase 3, Part 1 — tournament operation

Working breakdown of `SMF_Phase3_P1(SIGNED).PDF` (V1, 17 Oct 2026; signed 18 Oct 2026).
Eleven requirements across five stages, from creating a tournament to scheduling
its bouts.

The document is the authority. Where this file adds something, it is marked as a
decision or a question, never silently assumed.

---

## The journey, as the document states it

Create and set up the tournament → categories and weights → publish and open
registration → register athletes and check eligibility → complete documents →
check-in, medical examination and weigh-in → draw → schedule bouts and assign
rings → run the bouts → results → medals → publish.

Part 1 stops at **scheduling**. Running bouts, scoring, protests and medals are
Part 2.

---

## Requirements

| # | Requirement | Where it lives | Done |
|---|---|---|---|
| REQ-01 | Create and set up a tournament | `TournamentService`, **Tournaments** | yes |
| REQ-02 | Competition categories and Divisions | `CompetitionCategories`, `WeightClasses` | yes |
| REQ-03 | Athlete registration and eligibility | `TournamentEligibility`, `TournamentEntryService` | yes |
| REQ-04 | Medical documents, questions, consents | `MedicalFileService`, portal | yes |
| REQ-05 | Club account | portal roster, `MemberAccountService` | yes |
| REQ-06 | Coach account | portal roster, read-only | yes |
| REQ-07 | Athlete account | portal: record, medical, tournaments | yes |
| REQ-08 | Check-in and medical examination | **Entries**, the readiness desk | yes |
| REQ-09 | Weigh-in and eligibility | **Entries**, weigh-in | yes |
| REQ-10 | Draw with byes | `DrawBuilder`, `DrawService`, **Draw** | yes |
| REQ-11 | Bout schedule, rings and times | `BoutScheduler`, `ScheduleService`, **Schedule** | yes |

### How it was checked

- `DrawBuilder` and `BoutScheduler` are pure logic with no database, tested on
  their own: bracket sizes and bye counts from 2 to 64 athletes, club
  separation across 200 draws, the document's own bout-numbering example, and
  the three athlete-safety rules.
- The journey end to end against a live API, plus the three portals and the
  medical file.
- The console screens and the portal in a browser, in English and Arabic.

### Permissions

The document hands each stage to a different person, so these are separate
grants rather than one key that would let the weigh-in desk redraw a bracket:
`tournament.manage`, `tournament.entries`, `tournament.technical`,
`tournament.director`, `tournament.draw`, `tournament.schedule`.

### Accounts

Club, coach and athlete accounts authenticate against a separate scheme with
its own audience. A member's token is not merely unauthorised on an admin
endpoint — it fails validation there, and editing roles cannot change that.

### Build order

The spine first, then the two algorithms, then the portals:

1. **Domain model** — tournament, division, entry, bout, ring.
2. **REQ-02 engine** — age → category → track → division. Pure logic, heavily tested.
3. **REQ-01** — create, configure, publish.
4. **REQ-03 / REQ-04** — entry and the medical file.
5. **REQ-08 / REQ-09** — check-in, examination, weigh-in, the qualified pool.
6. **REQ-10** — the draw. Algorithmic, exact rules, test first.
7. **REQ-11** — the schedule. Algorithmic, constraint-heavy, test first.
8. **REQ-05 / REQ-06 / REQ-07** — the three account portals.

The portals are last on purpose: they are the largest single piece and the only
one that adds a new security surface, and every other requirement can be
operated from the console without them.

---

## What this changes in work already delivered

### 1. Masters is three categories, not one

Phase 2 (tracker item 00) listed the options as "U8, U10, U12, U14, U16, U18,
U24, Elite, and Masters" — nine, with one Masters covering 35–50. This document
lists **eleven**, splitting Masters into three selectable categories:

| Category | Age | | Category | Age |
|---|---|---|---|---|
| U8 | 6–7 | | U24 | 18–23 |
| U10 | 8–9 | | Elite | 18–40 |
| U12 | 10–11 | | Masters 35+ | 35–39 |
| U14 | 12–13 | | Masters 40+ | 40–44 |
| U16 | 14–15 | | Masters 45+ | 45–50 |
| U18 | 16–17 | | | |

This is newer and signed, so it wins. `CompetitionCategories` splits, and the
stored value `masters` from Phase 2 maps to the band the athlete's age falls in.

### 2. Tracks are new

REQ-02 rule 3: an athlete competes in **one track only** — Development (U8–U24),
Elite, or Masters. Where more than one is open to them, the system shows the
choice and the athlete picks one. Phase 2 had eligible categories but no notion
of a track.

### 3. Accounts are confirmed

REQ-05/06/07 settle the question left open on tracker ISSUE-03: the federation
does want athletes, coaches and clubs to hold accounts — with email invitations,
activation, and self-service editing that an administrator then approves. The
beneficiary profile and membership card already built are the record those
accounts will read; they are not a substitute.

---

## Decisions taken

- **Age** is the tournament year minus the birth year (REQ-02 rule 1), the same
  reading Phase 2 already uses, so one implementation serves both.
- **Division** = age category + gender + weight class (REQ-02 rule 5). It is the
  unit a draw is made for and a schedule is grouped by.
- **Bye placement** follows REQ-10 rule 3 exactly, including the odd case where
  the last bye meets the winner of the first bout.
- **No third-place bout.** Both losing semi-finalists take bronze (REQ-10 rule 5).
- **Bout numbering** is sequential by ring order within a day and continues
  across days rather than restarting (REQ-11 rule 12).

---

## Open questions

These are being raised rather than guessed. Work that does not depend on them
continues meanwhile.

1. **The official weight classes are missing.** REQ-01 rule 6 and REQ-02 rule 5
   require the federation's official weight classes *per age category and
   gender*. The document references them but does not list them, and the
   attachment it mentions ("ملاحظات الاتحاد السعودي للملاكمة التايلندية: انظر
   المرفق") did not come with the file. Until that table arrives the weight
   classes are configurable per tournament, seeded from the IFMA divisions
   already in the portal — which is a stand-in, not the real reference data.

2. **The federation's own notes attachment is missing**, so anything in it is
   unaccounted for.

3. **How does an account holder sign in?** Email and password is assumed. If the
   federation expects Nafath or منصة رياضي, that changes REQ-05/06/07
   substantially and should be settled before they are built.

4. **"Medical suspension (KO/RSCH)" has no source yet** (REQ-03 rule 3). The
   system needs somewhere suspensions are recorded. Part 2 produces them from
   bout results; for Part 1 they are entered by the technical team.

5. **Rest period across days.** REQ-11 rule 15 sets two hours between bouts and
   three a day. It does not say whether the two hours apply across midnight
   where a tournament runs late; assumed within a day only.

---

## Explicitly out of scope

Named in the document as deferred:

- Registration by athletes without an active membership — revisited after the
  payment phase.
- Accreditation requirements.
