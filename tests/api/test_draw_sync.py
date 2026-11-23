"""
Draw Management: a saved Draft against the athletes eligible now.

The three pages report two different data states — who is eligible now
(Draw Management, Draw Preparation) and who is in the saved draw (the
bracket) — and the server compares them by entry identity. A saved draw is
never changed by that comparison; only an explicit regeneration replaces a
Draft: reviewed lists, a written reason, a confirmation, the draw
permission, no publication, results or scheduling attached, one at a time,
in one transaction, audited, and still a Draft afterwards.

Runs against a throwaway database (tests/run-api-tests.sh).
"""
import json, os, sqlite3, sys, threading

HERE = os.path.dirname(os.path.abspath(__file__))
_source = open(os.path.join(HERE, "test_draw_generate.py"), encoding="utf-8").read()
exec(_source[:_source.index("SCHEDULE_ONLY =")])

SCHEDULE_ONLY = account_with(["tournament.schedule"])
slots = iter(sorted(k for k in DIV if k != ("female", 45.0)))


def division():
    return DIV[next(slots)]


def prep(d, token=ADMIN):
    return call("GET", base("/divisions/%d/draw-preparation" % d), token=token)[1]


def row(d):
    _, view = call("GET", base("/%d/draw-overview" % T), token=ADMIN)
    return next(x for x in view["divisions"] if x["id"] == d)


def regen(d, eligible, drawn, reason="Two athletes were approved after the draft.", confirmed=True, token=ADMIN, dry_run=False):
    return call("POST", base("/divisions/%d/draw/regenerate" % d),
                {"expectedEntryIds": eligible, "expectedDrawEntryIds": drawn, "reason": reason,
                 "confirmed": confirmed, "dryRun": dry_run}, token=token)


def stored_ids(d):
    return sorted({x for r in sql("select RedEntryId, BlueEntryId from Bouts where DivisionId=? and Round=1", (d,))
                   for x in r if x is not None})


def audits(d, action="tournament.draw_regenerated"):
    return sql("select Details from AuditLog where EntityType='tournament_division' and EntityId=? and Action=? order by Id",
               (d, action))


def rename(entry_ids, first, family):
    for e in entry_ids:
        rid = sql("select AthleteRegistrationId from TournamentEntries where Id=?", (e,))[0][0]
        p = json.loads(sql("select PayloadJson from Registrations where Id=?", (rid,))[0][0])
        p.update({"firstNameEn": first, "fatherNameEn": "", "familyNameEn": family})
        sql("update Registrations set PayloadJson=? where Id=?", (json.dumps(p, ensure_ascii=False), rid))


say("")
say("=== 4 eligible, 4 in the draft, the same athletes ===")
D = division()
ids = fill(D, 4)
check("generated", generate(D, ids)[0] == 200)
p = prep(D)
check("preparation: in step", p["sync"]["hasDraw"] and not p["sync"]["changed"], p["sync"])
check("bracket: 4 athletes, 0 BYEs, 3 bouts, in step",
      bracket(D)[1]["stats"]["athletes"] == 4 and bracket(D)[1]["stats"]["byes"] == 0
      and bracket(D)[1]["stats"]["bouts"] == 3 and not bracket(D)[1]["sync"]["changed"])
r = row(D)
check("overview: not flagged; potential and saved BYEs both 0",
      not r["eligibleChanged"] and r["byes"] == 0 and r["drawByes"] == 0 and r["drawAthletes"] == 4, r)
check("regenerating an unchanged draft is refused", regen(D, ids, ids)[1].get("code") == "unchanged")

say("")
say("=== 6 eligible, 4 in the draft (two approved later) — the real screenshots' case ===")
D = division()
first4 = fill(D, 4)
generate(D, first4)
before = sql("select Id from Bouts where DivisionId=? order by Id", (D,))
late = fill(D, 2)
rename(first4 + late, "Nedaa", "Test Test")  # identical names, as in the real division
p = prep(D)
s = p["sync"]
check("preparation: 6 eligible, 2 potential BYEs", p["plan"]["athletes"] == 6 and p["plan"]["byes"] == 2, p["plan"])
check("the draft is reported as changed", s["changed"], s)
check("added are exactly the two late entries, by id",
      sorted(a["entryId"] for a in s["added"]) == sorted(late) and s["removed"] == [], s["added"])
check("the saved draft keeps its own figures: 4 athletes, 0 BYEs, 3 bouts",
      s["draw"]["athletes"] == 4 and s["draw"]["byes"] == 0 and s["draw"]["bouts"] == 3, s["draw"])
check("identical names are told apart by entry id and reference",
      len({a["nameEn"] for a in s["added"]}) == 1 and len({a["entryId"] for a in s["added"]}) == 2
      and all(a["reference"] for a in s["added"]), s["added"])
check("the preparation list gives each athlete their reference", all(a.get("reference") for a in p["athletes"]))
b = bracket(D)[1]
check("bracket: still 4 athletes, 0 BYEs, 3 bouts", (b["stats"]["athletes"], b["stats"]["byes"], b["stats"]["bouts"]) == (4, 0, 3), b["stats"])
check("bracket: flagged as changed", b["sync"]["changed"] and len(b["sync"]["added"]) == 2)
r = row(D)
check("overview: flagged; 6 approved, 2 potential BYEs, the draft's 0 BYEs and 4 athletes",
      r["eligibleChanged"] and r["approvedAthletes"] == 6 and r["byes"] == 2 and r["drawByes"] == 0 and r["drawAthletes"] == 4, r)
check("nothing was written by looking", sql("select Id from Bouts where DivisionId=? order by Id", (D,)) == before)

now = s["eligibleEntryIds"]
drawn = s["drawEntryIds"]
st, body = regen(D, now, drawn, reason="   ")
check("no reason: refused (400)", st == 400, body)
st, body = regen(D, now, drawn, confirmed=False)
check("not confirmed: refused (400)", st == 400, body)
st, body = regen(D, now, drawn, token=SCHEDULE_ONLY)
check("without the draw permission: refused (403)", st == 403, st)
st, body = regen(D, now[:-1], drawn)
check("an eligible list that is not the current one: refused as stale", st == 409 and body.get("code") == "stale_athletes", body)
st, body = regen(D, now, drawn[:-1])
check("a draft list that is not the saved one: refused", st == 409 and body.get("code") == "draw_changed", body)
check("every refusal left the draft untouched", sql("select Id from Bouts where DivisionId=? order by Id", (D,)) == before
      and audits(D) == [])

st, body = regen(D, now, drawn)
check("regenerated: 6 athletes, 2 BYEs, 5 bouts", st == 200 and body["byes"] == 2 and body["bouts"] == 5, body)
b = bracket(D)[1]
check("the bracket now reads 6 athletes, 2 BYEs, 5 bouts", (b["stats"]["athletes"], b["stats"]["byes"], b["stats"]["bouts"]) == (6, 2, 5))
check("it is still a Draft, nothing published", b["status"] == "draft" and sql("select DrawPublishedAt from TournamentDivisions where Id=?", (D,))[0][0] is None)
names = [r_["nameEn"] for r_ in b["bracket"]["rounds"]]
check("rounds: Preliminary, Semi-final, Final", names == ["Preliminary", "Semi-final", "Final"], names)
rows = sql("select Round, Position, RedEntryId, BlueEntryId, IsBye, WinnerToPosition, WinnerEntryId, ScheduledDate, StartTime, RingId, BoutNumber "
           "from (select b.*, (select n.Position from Bouts n where n.Id=b.WinnerToBoutId) WinnerToPosition from Bouts b where b.DivisionId=?) "
           "order by Round, Position", (D,))
r1 = [x for x in rows if x[0] == 1]
r2 = [x for x in rows if x[0] == 2]
byes = [x for x in r1 if x[4]]
check("two BYE rows, each one real athlete, and two preliminary bouts",
      len(byes) == 2 and all((x[2] is None) != (x[3] is None) for x in byes) and len([x for x in r1 if not x[4]]) == 2)
check("even BYEs: semi-final 1 = BYE holder v BYE holder; semi-final 2 = two preliminary winners",
      r2[0][2] is not None and r2[0][3] is not None and r2[1][2] is None and r2[1][3] is None)
check("all six athletes placed once", stored_ids(D) == sorted(now))
check("no winners, no schedule, no bout numbers", all(x[6] is None and x[7] is None and x[8] is None and x[9] is None and x[10] is None for x in rows))
check("the old bouts are gone, new ones written", not set(i for (i,) in before) & set(i for (i,) in sql("select Id from Bouts where DivisionId=?", (D,))))
a = audits(D)
check("audited once, with both lists, the reason and the seed",
      len(a) == 1 and "4 -> 6 athletes" in a[0][0] and all("#%d" % e in a[0][0] for e in late)
      and "Reason: Two athletes were approved after the draft." in a[0][0] and "seed" in a[0][0], a)
check("after regeneration everything is in step again",
      not prep(D)["sync"]["changed"] and not bracket(D)[1]["sync"]["changed"] and not row(D)["eligibleChanged"])
check("the overview's saved BYEs now read 2", row(D)["drawByes"] == 2)

say("")
say("=== 3 eligible, 4 in the draft (one rejected after the draft) ===")
D = division()
ids = fill(D, 4)
generate(D, ids)
sql("update TournamentEntries set Status='rejected' where Id=?", (ids[0],))
s = prep(D)["sync"]
check("changed: one removed, with the reason", s["changed"] and [x["entryId"] for x in s["removed"]] == [ids[0]]
      and s["removed"][0]["reason"] == "Rejected at Final Approval" and s["added"] == [], s)
st, body = regen(D, s["eligibleEntryIds"], s["drawEntryIds"], reason="Athlete rejected at Final Approval.")
check("regenerated with 3: 1 BYE, 2 bouts", st == 200 and body["byes"] == 1 and body["bouts"] == 2, body)
check("the rejected athlete is no longer in the draw", ids[0] not in stored_ids(D))

say("")
say("=== 4 eligible, 4 in the draft, but not the same athletes ===")
D = division()
ids = fill(D, 4)
generate(D, ids)
sql("update TournamentEntries set Status='rejected' where Id=?", (ids[1],))
extra = fill(D, 1)
s = prep(D)["sync"]
check("same count, different identities: flagged",
      s["changed"] and len(s["eligibleEntryIds"]) == 4 and s["draw"]["athletes"] == 4
      and [x["entryId"] for x in s["added"]] == extra and [x["entryId"] for x in s["removed"]] == [ids[1]], s)
check("the overview flags it although both counts are 4", row(D)["eligibleChanged"] and row(D)["approvedAthletes"] == 4)

say("")
say("=== 6 eligible, no draw yet ===")
D = division()
ids = fill(D, 6)
s = prep(D)["sync"]
check("no draw: nothing to compare, nothing flagged", not s["hasDraw"] and not s["changed"] and s["draw"] is None)
r = row(D)
check("overview: 2 potential BYEs, no saved BYEs", r["byes"] == 2 and r["drawByes"] is None and not r["eligibleChanged"], r)
st, body = regen(D, ids, [])
check("regenerate without a draw: refused", st == 409 and body.get("code") == "no_draw", body)

say("")
say("=== 6 eligible, 6 in the draft ===")
D = division()
ids = fill(D, 6)
generate(D, ids)
b = bracket(D)[1]
check("6 athletes, 2 BYEs, 5 bouts, in step", (b["stats"]["athletes"], b["stats"]["byes"], b["stats"]["bouts"]) == (6, 2, 5)
      and not b["sync"]["changed"])

say("")
say("=== a withdrawal after the draft: the walkover protects it ===")
D = division()
ids = fill(D, 4)
generate(D, ids)
st, body = call("POST", base("/entries/%d/withdraw" % ids[0]), {"reason": "Injured."}, token=ADMIN)
check("the withdrawal is recorded", st == 200, body)
s = prep(D)["sync"]
check("the walkover already reflects the withdrawal: the draft and the eligible list agree",
      not s["changed"] and ids[0] not in s["drawEntryIds"] and ids[0] not in s["eligibleEntryIds"], s)
late = fill(D, 1)
s = prep(D)["sync"]
check("a later approval is flagged", s["changed"] and [x["entryId"] for x in s["added"]] == late, s)
before = sql("select * from Bouts where DivisionId=? order by Id", (D,))
st, body = regen(D, s["eligibleEntryIds"], s["drawEntryIds"])
check("regeneration refused: a walkover is attached", st == 409 and body.get("code") == "protected", body)
check("and the draft is untouched", sql("select * from Bouts where DivisionId=? order by Id", (D,)) == before)

say("")
say("=== scheduling and publication protect a draft ===")
D = division()
ids = fill(D, 4)
generate(D, ids)
fill(D, 1)
s = prep(D)["sync"]
bout = sql("select Id from Bouts where DivisionId=? and IsBye=0 limit 1", (D,))[0][0]
sql("update Bouts set ScheduledDate='2026-12-20' where Id=?", (bout,))
# Division-level lock (2026-11-22): a scheduled bout that has not started does not block regeneration — the division
# is rescheduled. Checked as a dry run, so this draft stays as it is for the checks below.
st, body = regen(D, s["eligibleEntryIds"], s["drawEntryIds"], dry_run=True)
check("a scheduled bout that has not started: regeneration allowed (it is rescheduled)", st == 200, body)
sql("update Bouts set ScheduledDate=NULL where Id=?", (bout,))
sql("update Bouts set WinnerEntryId=RedEntryId where Id=?", (bout,))
st, body = regen(D, s["eligibleEntryIds"], s["drawEntryIds"])
check("a recorded winner: refused as protected", st == 409 and body.get("code") == "protected", body)
sql("update Bouts set WinnerEntryId=NULL where Id=?", (bout,))
sql("update TournamentDivisions set DrawPublishedAt='2026-11-08 10:00:00' where Id=?", (D,))
st, body = regen(D, s["eligibleEntryIds"], s["drawEntryIds"])
check("a published draw: refused", st == 409 and body.get("code") == "published", body)
sql("update TournamentDivisions set DrawPublishedAt=NULL where Id=?", (D,))
check("none of it touched the draft", audits(D) == [] and len(stored_ids(D)) == 4)

say("")
say("=== two regenerations at once: one draw ===")
D = division()
ids = fill(D, 4)
generate(D, ids)
fill(D, 2)
s = prep(D)["sync"]
results = []
def fire():
    results.append(regen(D, s["eligibleEntryIds"], s["drawEntryIds"]))
threads = [threading.Thread(target=fire) for _ in range(4)]
[t.start() for t in threads]
[t.join() for t in threads]
codes = sorted(st for st, _ in results)
check("exactly one succeeds", codes.count(200) == 1 and all(c == 409 for c in codes if c != 200), codes)
check("one draw of 6 (5 bouts + 2 BYE rows + 0 extra)", len(stored_ids(D)) == 6
      and sql("select count(*) from Bouts where DivisionId=? and IsBye=0", (D,))[0][0] == 5 and len(audits(D)) == 1)

say("")
say("=== a failure half-way rolls everything back ===")
D = division()
ids = fill(D, 4)
generate(D, ids)
fill(D, 2)
s = prep(D)["sync"]
before = sql("select * from Bouts where DivisionId=? order by Id", (D,))
con = sqlite3.connect(DB, timeout=30)
con.execute("create trigger test_fail_bouts before insert on Bouts when new.DivisionId = %d "
            "begin select raise(abort, 'simulated failure'); end" % D)
con.commit()
con.close()
st, body = regen(D, s["eligibleEntryIds"], s["drawEntryIds"])
con = sqlite3.connect(DB, timeout=30)
con.execute("drop trigger test_fail_bouts")
con.commit()
con.close()
check("the request fails", st >= 500, st)
check("the old draft is intact, row for row", sql("select * from Bouts where DivisionId=? order by Id", (D,)) == before)
check("and nothing was audited", audits(D) == [])
st, body = regen(D, s["eligibleEntryIds"], s["drawEntryIds"])
check("once the fault is gone it succeeds", st == 200 and body["bouts"] == 5, body)

say("")
say("FAILED: " + (", ".join(failures) if failures else "none"))
sys.exit(1 if failures else 0)
