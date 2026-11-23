"""
Draw Management, Phase 3: generating a Draft draw.

POST /api/admin/tournaments/divisions/{id}/draw/generate and
GET  /api/admin/tournaments/divisions/{id}/draw-bracket, against a throwaway
database: who may generate, the dry run writing nothing, the athlete list
checked against what the page showed (stale lists refused), an existing draw
never replaced, concurrent requests producing one draw, 0/1/129 athletes
refused, the counts for 2, 3, 9, 70, 76, 127 and 128 athletes, the saved
tree, Draft status (not published, not scheduled, no winners), the audit
entry, club separation, and the bracket endpoint agreeing with the rows.
"""
import json, os, sqlite3, sys, threading, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
# The shared helpers (call, sql, ADMIN, athlete, tournament, account_with, base, check, say, failures).
_source = open(os.path.join(HERE, "test_readiness.py"), encoding="utf-8").read()
exec(_source[:_source.index('say("")\nsay("=== setup ===")')])

say("")
say("=== setup ===")
FEMALE = [45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75]
MALE = [45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91]
T = tournament(["elite"], ["male", "female"], {"elite:female": FEMALE, "elite:male": MALE})
_, detail = call("GET", base("/%d" % T), token=ADMIN)
DIV = {(d["gender"], float(d["weightLimitKg"])): d["id"] for d in detail["divisions"] if d["weightLimitKg"]}

# One real athlete and entry made through the API, then copied in SQL for
# the large fields (each copy gets its own registration, as the schema requires).
rid, _, _ = athlete(25, "female")
st, made = call("POST", base("/%d/entries" % T), {"athleteRegistrationId": rid, "divisionId": DIV[("female", 45.0)],
                                                  "declaredWeightKg": 44, "clubName": "Template Club"}, token=ADMIN)
assert st == 200, made
TEMPLATE = made["id"]
sql("update TournamentEntries set Status='withdrawn' where Id=?", (TEMPLATE,))
NOW = "2026-11-01 10:00:00"


def fill(division_id, count, club=lambda i: "Club %d" % (i % 7), centre=lambda i: None, status="qualified"):
    con = sqlite3.connect(DB, timeout=30)
    try:
        cols = [r[1] for r in con.execute("pragma table_info(TournamentEntries)") if r[1] != "Id"]
        template = dict(zip(cols, con.execute("select %s from TournamentEntries where Id=?" % ", ".join(cols),
                                              (TEMPLATE,)).fetchone()))
        reg_cols = [r[1] for r in con.execute("pragma table_info(Registrations)") if r[1] != "Id"]
        reg_template = dict(zip(reg_cols, con.execute("select %s from Registrations where Id=?" % ", ".join(reg_cols),
                                                      (template["AthleteRegistrationId"],)).fetchone()))
        # A Passed weigh-in only counts with a recorded weight that makes the
        # class (DrawEligibility): the limit itself, or just over an open class's floor.
        limit, floor = con.execute("select WeightLimitKg, WeightFloorKg from TournamentDivisions where Id=?",
                                   (division_id,)).fetchone()
        weight = str(limit) if limit is not None else str(float(floor) + 1)
        ids = []
        for i in range(count):
            reg = dict(reg_template)
            payload = json.loads(reg["PayloadJson"])
            payload.update({"firstNameEn": "Draw", "familyNameEn": "Athlete %03d" % (i + 1),
                            "email": "draw.%s@example.com" % uuid.uuid4().hex[:10]})
            reg.update({"PayloadJson": json.dumps(payload, ensure_ascii=False), "NormalizedEmail": None,
                        "ReferenceNumber": "SMF-A-DRAW-%s" % uuid.uuid4().hex[:10], "MembershipNumber": None})
            cur = con.execute("insert into Registrations (%s) values (%s)" % (", ".join(reg), ", ".join("?" * len(reg))),
                              tuple(reg.values()))
            row = dict(template)
            row.update({"AthleteRegistrationId": cur.lastrowid, "DivisionId": division_id, "ClubName": club(i),
                        "TrainingCentre": centre(i), "Status": status, "QualifiedAt": NOW if status == "qualified" else None,
                        "CheckedInAt": NOW, "MedicalResult": "passed", "WeighInResult": "passed",
                        "ActualWeightKg": weight})
            cur = con.execute("insert into TournamentEntries (%s) values (%s)" % (", ".join(row), ", ".join("?" * len(row))),
                              tuple(row.values()))
            ids.append(cur.lastrowid)
        con.commit()
        return ids
    finally:
        con.close()


def generate(division_id, ids, token=ADMIN, dry=False):
    return call("POST", base("/divisions/%d/draw/generate" % division_id),
                {"expectedEntryIds": ids, "dryRun": dry}, token=token)


def bracket(division_id, token=ADMIN):
    return call("GET", base("/divisions/%d/draw-bracket" % division_id), token=token)


def bouts(division_id):
    return sql("select Id, Round, Position, RedEntryId, BlueEntryId, IsBye, WinnerToBoutId, WinnerToCorner, "
               "WinnerEntryId, BoutNumber, ScheduledDate, StartTime, RingId from Bouts where DivisionId=? "
               "order by Round, Position", (division_id,))


def audit_count(division_id):
    return sql("select count(*) from AuditLog where EntityType='tournament_division' and EntityId=? and Action='tournament.draw_created'",
               (division_id,))[0][0]


def bracket_size(n):
    size = 1
    while size < n:
        size <<= 1
    return size


SCHEDULE_ONLY = account_with(["tournament.schedule"])
ENTRIES_ONLY = account_with(["tournament.entries"])

say("")
say("=== permissions and refusals ===")
d = DIV[("male", 45.0)]
ids = fill(d, 4)
check("generate without tournament.draw is refused (403)", generate(d, ids, token=SCHEDULE_ONLY)[0] == 403)
check("dry run without tournament.draw is refused (403)", generate(d, ids, token=SCHEDULE_ONLY, dry=True)[0] == 403)
check("nothing was drawn by a refused request", len(bouts(d)) == 0)
check("no bracket yet: draw-bracket is 404", bracket(d)[0] == 404)
check("generate for a division that does not exist is 404", generate(999999, ids)[0] == 404)

for weight, n in ((45.0, 0), (48.0, 1)):
    dz = DIV[("female", weight)]
    got = fill(dz, n)
    st, body = generate(dz, got)
    check("%d athlete(s): refused as not enough (409)" % n, st == 409 and body.get("code") == "not_enough_athletes", body)
    check("%d athlete(s): nothing written" % n, len(bouts(dz)) == 0 and audit_count(dz) == 0)

d129 = DIV[("female", 67.0)]
big = fill(d129, 129)
st, body = generate(d129, big)
check("129 athletes: refused as over capacity (409)", st == 409 and body.get("code") == "over_capacity", body)
check("129 athletes: nothing written", len(bouts(d129)) == 0)

say("")
say("=== dry run ===")
d = DIV[("male", 48.0)]
ids = fill(d, 6)
st, body = generate(d, ids, dry=True)
check("dry run with the shown list is valid", st == 200 and body == {"valid": True}, body)
check("dry run writes no bouts and no audit entry", len(bouts(d)) == 0 and audit_count(d) == 0)
check("dry run leaves the division unpublished",
      sql("select DrawPublishedAt from TournamentDivisions where Id=?", (d,))[0][0] is None)

say("")
say("=== stale athlete list ===")
d = DIV[("female", 71.0)]
ids = fill(d, 5)
st, body = generate(d, ids[:-1])
check("a list missing an approved athlete is stale (409)", st == 409 and body.get("code") == "stale_athletes", body)
st, body = generate(d, ids + [TEMPLATE])
check("a list with an athlete no longer approved is stale (409)", st == 409 and body.get("code") == "stale_athletes", body)
st, body = generate(d, [])
check("an empty list is stale (409)", st == 409 and body.get("code") == "stale_athletes", body)
fill(d, 1)
st, body = generate(d, ids)
check("an athlete approved after the page loaded makes the list stale", st == 409 and body.get("code") == "stale_athletes")
pending = fill(d, 1, status="checked_in")[0]
current = [r[0] for r in sql("select Id from TournamentEntries where DivisionId=? and Status='qualified'", (d,))]
check("an athlete without Final Draw Approval is not part of the pool", pending not in current)
st, body = generate(d, current, dry=True)
check("the refreshed list is valid", st == 200, body)
check("stale refusals wrote nothing", len(bouts(d)) == 0 and audit_count(d) == 0)

say("")
say("=== generation, counts and the saved tree ===")
cases = [("female", 51.0, 2), ("female", 54.0, 3), ("female", 57.0, 9), ("female", 60.0, 70),
         ("female", 63.5, 76), ("male", 51.0, 128), ("male", 54.0, 127), ("male", 57.0, 14), ("male", 60.0, 16)]
expected_rounds = {70: [6, 32, 16, 8, 4, 2, 1], 76: [12, 32, 16, 8, 4, 2, 1], 128: [64, 32, 16, 8, 4, 2, 1],
                   127: [63, 32, 16, 8, 4, 2, 1], 9: [1, 4, 2, 1], 3: [1, 1], 2: [1], 14: [6, 4, 2, 1], 16: [8, 4, 2, 1]}
for gender, weight, n in cases:
    d = DIV[(gender, weight)]
    ids = fill(d, n)
    size = bracket_size(n)
    byes = size - n
    st, body = generate(d, ids)
    label = "%d athletes" % n
    check(label + ": generated (200) as a Draft", st == 200 and body["status"] == "draft", body)
    check(label + ": %d BYEs, %d bouts" % (byes, n - 1), body.get("byes") == byes and body.get("bouts") == n - 1, body)
    rows = bouts(d)
    real = [r for r in rows if not r[5]]
    per_round = [sum(1 for r in real if r[1] == k) for k in range(1, max(r[1] for r in rows) + 1)]
    check(label + ": bouts per round " + "/".join(map(str, expected_rounds[n])), per_round == expected_rounds[n], per_round)
    check(label + ": total bouts N−1 (BYE placements are not bouts)", len(real) == n - 1)
    check(label + ": BYE placements = bracket − N", sum(1 for r in rows if r[5]) == byes)
    placed = [x for r in rows if r[1] == 1 for x in (r[3], r[4]) if x is not None]
    check(label + ": every approved athlete placed exactly once", sorted(placed) == sorted(ids))
    byid = {r[0]: r for r in rows}
    last = max(r[1] for r in rows)
    tree = all((r[1] == last and r[6] is None) or (r[6] in byid and byid[r[6]][1] == r[1] + 1 and r[7] in ("red", "blue"))
               for r in rows)
    slots = [(r[6], r[7]) for r in rows if r[6] is not None]
    check(label + ": a valid tree (each bout feeds one free slot of the next round)", tree and len(slots) == len(set(slots)))
    check(label + ": one Final, no third-place bout", sum(1 for r in rows if r[1] == last) == 1)
    check(label + ": no winners, not scheduled", all(r[8] is None and r[9] is None and r[10] is None and r[11] is None
                                                    and r[12] is None for r in rows))
    check(label + ": not published", sql("select DrawPublishedAt from TournamentDivisions where Id=?", (d,))[0][0] is None)
    check(label + ": one audit entry", audit_count(d) == 1)

    # The bracket endpoint agrees with the rows.
    st, view = bracket(d)
    check(label + ": draw-bracket 200, status draft", st == 200 and view["status"] == "draft", st)
    if st == 200:
        stats = view["stats"]
        check(label + ": stats athletes/byes/bouts/bracket", (stats["athletes"], stats["byes"], stats["bouts"], stats["bracketSize"])
              == (n, byes, n - 1, size), stats)
        listed = {b["id"]: b for rd in view["bracket"]["rounds"] for b in rd["bouts"]}
        same = len(listed) == len(rows) and all(
            listed[r[0]]["winnerToBoutId"] == r[6] and listed[r[0]]["winnerToCorner"] == r[7]
            and (listed[r[0]]["red"] or {}).get("id") == r[3] and (listed[r[0]]["blue"] or {}).get("id") == r[4]
            for r in rows)
        check(label + ": the bracket returned is the saved graph", same)
        names = [rd["nameEn"] for rd in view["bracket"]["rounds"]]
        check(label + ": round names " + ", ".join(names), names[-1] == "Final"
              and (names[0] == "Preliminary") == (byes > 0))
        check(label + ": generated by and seed are recorded", view["generated"] and "seed" in (view["generated"]["details"] or ""))

_, view = bracket(DIV[("male", 51.0)])
check("128 athletes: the first round is the Round of 128", view["bracket"]["rounds"][0]["nameEn"] == "Round of 128")
_, view = bracket(DIV[("female", 60.0)])
check("70 athletes: Preliminary, then Round of 64",
      [r["nameEn"] for r in view["bracket"]["rounds"]][:2] == ["Preliminary", "Round of 64"])

say("")
say("=== an existing draw is never replaced ===")
d = DIV[("female", 57.0)]
before = bouts(d)
ids = [r[0] for r in sql("select Id from TournamentEntries where DivisionId=? and Status='qualified'", (d,))]
st, body = generate(d, ids)
check("a second generation is refused (409 existing_draw)", st == 409 and body.get("code") == "existing_draw", body)
st, body = generate(d, ids, dry=True)
check("a dry run on a drawn division is refused too", st == 409 and body.get("code") == "existing_draw")
check("the existing draw is unchanged", bouts(d) == before and audit_count(d) == 1)

say("")
say("=== concurrency ===")
d = DIV[("female", 75.0)]
ids = fill(d, 10)
results = []


def fire():
    results.append(generate(d, ids))


threads = [threading.Thread(target=fire) for _ in range(8)]
for t in threads:
    t.start()
for t in threads:
    t.join()
codes = sorted(r[0] for r in results)
check("8 requests at once: exactly one succeeds", codes.count(200) == 1, codes)
check("the others are refused as an existing draw",
      all(r[1].get("code") == "existing_draw" for r in results if r[0] != 200), [r[1] for r in results if r[0] != 200][:2])
check("exactly one draw was written (16-slot tree, 9 bouts)",
      len([r for r in bouts(d) if not r[5]]) == 9 and audit_count(d) == 1)

say("")
say("=== viewing permissions ===")
d = DIV[("female", 57.0)]
check("schedule-only account may view the bracket", bracket(d, token=SCHEDULE_ONLY)[0] == 200)
check("an account without draw/schedule/manage may not", bracket(d, token=ENTRIES_ONLY)[0] == 403)

say("")
say("=== club separation (best effort, nobody excluded) ===")
for weight, n in ((63.5, 10), (67.0, 12), (71.0, 9)):
    d = DIV[("male", weight)]
    # Two even clubs, one of them known only by its training centre: both count as clubs.
    ids = fill(d, n, club=lambda i: None if i % 2 else "Alpha", centre=lambda i: "Beta Centre" if i % 2 else None)
    st, body = generate(d, ids)
    check("%d athletes in clubs: generated" % n, st == 200, body)
    clubs = dict(sql("select Id, coalesce(nullif(trim(ClubName),''), nullif(trim(TrainingCentre),'')) from TournamentEntries "
                     "where DivisionId=?", (d,)))
    rows = bouts(d)
    first_bouts = [r for r in rows if r[3] and r[4] and (r[1] == 1 or any(b[5] and b[6] == r[0] for b in rows))]
    clashes = [r for r in first_bouts if clubs[r[3]] == clubs[r[4]]]
    check("%d athletes: no first bout between team-mates" % n, not clashes, [(clubs[r[3]], clubs[r[4]]) for r in clashes])
    placed = [x for r in rows if r[1] == 1 for x in (r[3], r[4]) if x]
    check("%d athletes: everyone drawn" % n, sorted(placed) == sorted(ids))

# One club only: separation is impossible, and nobody is left out.
d = DIV[("male", 75.0)]
ids = fill(d, 7, club=lambda i: "Only Club")
st, body = generate(d, ids)
check("7 athletes from one club: still drawn", st == 200 and body["bouts"] == 6, body)
placed = [x for r in bouts(d) if r[1] == 1 for x in (r[3], r[4]) if x]
check("7 athletes from one club: all placed", sorted(placed) == sorted(ids))

say("")
say("=== the legacy endpoints are unaffected ===")
d = DIV[("male", 81.0)]
ids = fill(d, 4)
st, body = call("POST", base("/divisions/%d/draw" % d), {}, token=ADMIN)
check("the legacy draw endpoint still creates a draw", st == 200, body)
check("the legacy draw is readable through draw-bracket", bracket(d)[0] == 200)

say("")
if failures:
    say("FAILED: %d check(s)" % len(failures))
    for name in failures[:20]:
        say("  - " + name)
    sys.exit(1)
say("ALL DRAW GENERATION CHECKS PASSED")
