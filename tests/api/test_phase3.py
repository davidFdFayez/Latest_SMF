"""The whole Phase 3 Part 1 journey, end to end, against a live API."""
import json, sys, os, io, uuid, urllib.request, urllib.error, datetime, sqlite3

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = os.environ.get("SMF_TEST_API", "http://127.0.0.1:5197")
DB = os.environ["SMF_TEST_DB"]
YEAR = datetime.date.today().year
failures, log = [], []


def say(text):
    log.append(text)
    print(text, flush=True)


def check(name, ok, detail=""):
    text = str(detail)
    if len(text) > 170:
        text = text[:170] + "..."
    say(("  PASS " if ok else "  FAIL ") + name + (" - " + text if detail else ""))
    if not ok:
        failures.append(name)


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    head = {"Content-Type": "application/json"} if data else {}
    if token:
        head["Authorization"] = "Bearer " + token
    req = urllib.request.Request(API + path, data=data, method=method, headers=head)
    try:
        with urllib.request.urlopen(req) as response:
            text = response.read().decode()
            return response.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        try:
            return error.code, json.loads(text)
        except ValueError:
            return error.code, text


status, body = call("POST", "/api/auth/login", {"username": "admin", "password": "Admin@123"})
TOKEN = body["token"]


def sql(query, args=()):
    con = sqlite3.connect(DB)
    try:
        rows = con.execute(query, args).fetchall()
        con.commit()
        return rows
    finally:
        con.close()


# ── athletes to work with ─────────────────────────────────────────────────
def make_athlete(age, gender="male", weight="60", club="Riyadh Club"):
    """An approved athlete membership, which is what entry requires."""
    payload = {
        "firstNameAr": "علي", "fatherNameAr": "محمد", "familyNameAr": "الحربي",
        "firstNameEn": "Ali", "fatherNameEn": "Mohammed",
        "familyNameEn": "Al" + "".join(chr(97 + (b % 26)) for b in uuid.uuid4().bytes[:5]),
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": "%d-06-15" % (YEAR - age), "nationality": "SA", "gender": gender,
        "phone": "+966512345678", "email": "a%s@example.com" % uuid.uuid4().hex[:8],
        "region": "الرياض", "city": "الرياض",
        "paraAthlete": "no", "currentWeight": weight, "clubName": club,
        "consent": True,
    }
    if YEAR - int(payload["dateOfBirth"][:4]) < 19:
        payload.update({"guardianName": "G", "guardianPhone": "+966512345670",
                        "guardianRelation": "father"})

    st, created = call("POST", "/api/registrations", {"type": "athlete", "payload": payload})
    assert st == 200, created
    rid = sql("select Id from Registrations where ReferenceNumber=?", (created["referenceNumber"],))[0][0]

    for step in ("under_review", "awaiting_approval"):
        call("PUT", "/api/admin/registrations/%d/status" % rid, {"status": step}, token=TOKEN)
    call("PUT", "/api/admin/registrations/%d/status" % rid,
         {"status": "approved", "membershipNumber": "SMF-A-%d" % rid}, token=TOKEN)
    return rid


# ══════════════════════════════════════════════════════════════════════════
say("=== REQ-01: creating and publishing a tournament ===")

setup = {
    "nameAr": "بطولة المملكة 2026", "nameEn": "Kingdom Championship 2026",
    "type": "kingdom", "competitionType": "muaythai_combat",
    "locationAr": "الرياض", "locationEn": "Riyadh",
    "startDate": "%d-12-01" % YEAR, "endDate": "%d-12-02" % YEAR,
    "firstBoutTime": "17:00:00",
    "genders": ["male", "female"],
    "categories": ["u18", "elite"],
}
status, tournament = call("POST", "/api/admin/tournaments", setup, token=TOKEN)
check("a tournament is created", status == 201, status)
TID = tournament["id"]
check("it starts as a draft", tournament["status"] == "draft", tournament["status"])
check("entries are not open yet", tournament["registrationOpen"] is False)

closes = datetime.date(YEAR, 12, 1) - datetime.timedelta(days=7)
check("entries close 7 days before by default (rule 9)",
      tournament["registrationClosesAt"].startswith(closes.isoformat()),
      tournament["registrationClosesAt"])
check("it runs over two days", len(tournament["days"]) == 2, tournament["days"])

status, detail = call("GET", "/api/admin/tournaments/%d" % TID, token=TOKEN)
divisions = detail["divisions"]
check("divisions are generated from category x gender x weight (REQ-02 rule 5)",
      len(divisions) > 0, len(divisions))
check("both genders appear", {d["gender"] for d in divisions} == {"male", "female"})
check("both categories appear", {d["category"] for d in divisions} == {"u18", "elite"})
check("each division is one weight class",
      all(d["weightLimitKg"] is not None or d["weightFloorKg"] is not None for d in divisions))

status, body = call("POST", "/api/admin/tournaments/%d/publish" % TID, token=TOKEN)
check("publishing opens entries (rule 11)", status == 200 and body["registrationOpen"] is True, body)

say("")
say("=== REQ-01 rule 8: rings are not set at creation ===")
check("a new tournament has no rings", len(detail["rings"]) == 0)

say("")
say("=== REQ-02 / REQ-03: eligibility decides what is offered ===")

u18_male = make_athlete(16, "male", "50")
status, verdict = call("GET", "/api/admin/tournaments/%d/eligibility/%d" % (TID, u18_male), token=TOKEN)
check("a 16-year-old may enter", verdict["canEnter"] is True, verdict.get("barriers"))
check("only U18 is offered to them", {o["category"] for o in verdict["options"]} == {"u18"},
      [o["category"] for o in verdict["options"]])
check("they are on the Development track", verdict["tracks"] == ["development"], verdict["tracks"])

adult = make_athlete(30, "male", "70")
status, verdict30 = call("GET", "/api/admin/tournaments/%d/eligibility/%d" % (TID, adult), token=TOKEN)
check("a 30-year-old is offered Elite only", {o["category"] for o in verdict30["options"]} == {"elite"},
      [o["category"] for o in verdict30["options"]])

female = make_athlete(16, "female", "50")
status, verdictF = call("GET", "/api/admin/tournaments/%d/eligibility/%d" % (TID, female), token=TOKEN)
divisions_offered = [d for o in verdictF["options"] for d in o["divisions"]]
female_division_ids = {d["divisionId"] for d in divisions_offered}
all_female = {d["id"] for d in divisions if d["gender"] == "female"}
check("a woman is offered only women's divisions", female_division_ids <= all_female,
      len(female_division_ids))

# membership that is not active
inactive = make_athlete(25, "male", "70")
sql("update Registrations set Status='expired' where Id=?", (inactive,))
status, v = call("GET", "/api/admin/tournaments/%d/eligibility/%d" % (TID, inactive), token=TOKEN)
check("an inactive membership blocks entry (rule 2)",
      v["canEnter"] is False and any(b["code"] == "membership_inactive" for b in v["barriers"]),
      [b["code"] for b in v["barriers"]])

# a medical suspension
suspended = make_athlete(25, "male", "70")
sql("insert into MedicalSuspensions (AthleteRegistrationId, Reason, StartsOn, EndsOn, CreatedAt) "
    "values (?, 'ko', ?, ?, ?)",
    (suspended, (datetime.date.today() - datetime.timedelta(days=10)).isoformat(),
     (datetime.date.today() + datetime.timedelta(days=50)).isoformat(),
     datetime.datetime.utcnow().isoformat()))
status, v = call("GET", "/api/admin/tournaments/%d/eligibility/%d" % (TID, suspended), token=TOKEN)
check("an active KO suspension blocks entry (rule 3)",
      v["canEnter"] is False and any(b["code"] == "medical_suspension" for b in v["barriers"]),
      [b["code"] for b in v["barriers"]])

say("")
say("=== REQ-03: entering, and the one-entry rule ===")

u18_male_divisions = [d for o in verdict["options"] for d in o["divisions"]]
target = sorted(u18_male_divisions, key=lambda d: d["weightLimitKg"] or 999)[2]

status, entry = call("POST", "/api/admin/tournaments/%d/entries" % TID,
                     {"athleteRegistrationId": u18_male, "divisionId": target["divisionId"],
                      "declaredWeightKg": 50, "heightCm": 170, "clubName": "Riyadh Club",
                      "coachName": "Coach A", "coachPhone": "+966512345679"}, token=TOKEN)
check("an eligible athlete is entered", status == 200, entry)

status, again = call("POST", "/api/admin/tournaments/%d/entries" % TID,
                     {"athleteRegistrationId": u18_male, "divisionId": target["divisionId"]}, token=TOKEN)
check("the same athlete cannot enter twice (rule 12)", again == 409 or status == 409, again)

status, blocked = call("POST", "/api/admin/tournaments/%d/entries" % TID,
                       {"athleteRegistrationId": suspended, "divisionId": target["divisionId"]}, token=TOKEN)
check("a suspended athlete is refused at the API too", status == 409, status)

say("")
say("=== REQ-08 / REQ-09: check-in, examination and weigh-in ===")

# a full division of eight, so the draw has something to work with
division_id = target["divisionId"]
entries = []
for i in range(8):
    athlete = make_athlete(16, "male", "50", club="Club %d" % (i % 4))
    st, created = call("POST", "/api/admin/tournaments/%d/entries" % TID,
                       {"athleteRegistrationId": athlete, "divisionId": division_id,
                        "declaredWeightKg": 50, "clubName": "Club %d" % (i % 4)}, token=TOKEN)
    assert st == 200, created
    entries.append(created["id"])

first = entries[0]
status, _ = call("POST", "/api/admin/tournaments/entries/%d/medical" % first,
                 {"result": "passed", "note": None, "documentsMissing": False}, token=TOKEN)
check("the examination is refused before check-in (rule order)", status == 409, status)

status, _ = call("POST", "/api/admin/tournaments/entries/%d/check-in" % first, token=TOKEN)
check("check-in is recorded (REQ-08 rule 4)", status == 200, status)

status, body = call("POST", "/api/admin/tournaments/entries/%d/medical" % first,
                    {"result": "passed", "note": None, "documentsMissing": True}, token=TOKEN)
check("passing with documents missing needs a reason (rule 6)", status == 400, status)

status, body = call("POST", "/api/admin/tournaments/entries/%d/medical" % first,
                    {"result": "passed", "note": "Certificate seen at the desk.",
                     "documentsMissing": True}, token=TOKEN)
check("with a reason it is allowed", status == 200, body)

status, preview = call("GET",
                       "/api/admin/tournaments/entries/%d/weigh-in/preview?weightKg=49.5" % first, token=TOKEN)
check("a weight inside the class reads as within", preview["withinRegisteredClass"] is True, preview)

status, preview = call("GET",
                       "/api/admin/tournaments/entries/%d/weigh-in/preview?weightKg=66" % first, token=TOKEN)
check("a weight outside it does not", preview["withinRegisteredClass"] is False)
check("and the classes they could move to are offered (rule 4)",
      len(preview["alternatives"]) > 0, len(preview["alternatives"]))

status, body = call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % first,
                    {"weightKg": 66, "result": "passed", "noShow": False}, token=TOKEN)
check("passing while over the class is refused", status == 409, status)

status, body = call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % first,
                    {"weightKg": 49.5, "result": "passed", "noShow": False}, token=TOKEN)
check("passing inside the class is accepted", status == 200, body)

status, body = call("POST", "/api/admin/tournaments/entries/%d/approve" % first, token=TOKEN)
check("the director's approval qualifies them (rule 7)",
      status == 200 and body["status"] == "qualified", body)

# take the rest through
for entry_id in entries[1:]:
    call("POST", "/api/admin/tournaments/entries/%d/check-in" % entry_id, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/medical" % entry_id,
         {"result": "passed", "note": None, "documentsMissing": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % entry_id,
         {"weightKg": 49.5, "result": "passed", "noShow": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/approve" % entry_id, token=TOKEN)

status, listing = call("GET", "/api/admin/tournaments/%d/entries?status=qualified" % TID, token=TOKEN)
check("eight athletes are in the qualified pool", len(listing) == 8, len(listing))
check("an athlete with no medical file reads as incomplete, not complete",
      all(e["medicalComplete"] is False and len(e["medicalMissing"]) > 0 for e in listing),
      [e["medicalComplete"] for e in listing][:4])

# a no-show is a DSQ
spare = make_athlete(16, "male", "50")
st, extra = call("POST", "/api/admin/tournaments/%d/entries" % TID,
                 {"athleteRegistrationId": spare, "divisionId": division_id}, token=TOKEN)
call("POST", "/api/admin/tournaments/entries/%d/check-in" % extra["id"], token=TOKEN)
status, body = call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % extra["id"],
                    {"noShow": True}, token=TOKEN)
check("not appearing at the weigh-in is a DSQ (rule 6)",
      body["status"] == "disqualified", body.get("status"))

say("")
say("=== REQ-10: the draw ===")

status, body = call("POST", "/api/admin/tournaments/divisions/%d/draw" % division_id,
                    {"seed": 1234}, token=TOKEN)
check("a draw is made from the qualified pool", status == 200, body)
check("eight athletes give seven bouts", body["bouts"] == 7, body)

status, bracket = call("GET", "/api/admin/tournaments/divisions/%d/draw" % division_id, token=TOKEN)
check("three rounds", bracket["totalRounds"] == 3, bracket["totalRounds"])
names = [r["nameEn"] for r in bracket["rounds"]]
check("named quarter-final, semi-final, final",
      names == ["Quarter-final", "Semi-final", "Final"], names)
check("the disqualified athlete is not in it",
      all(b["red"] is None or b["red"]["id"] != extra["id"] for r in bracket["rounds"] for b in r["bouts"]))

first_round = bracket["rounds"][0]["bouts"]
clubs = [(b["red"]["club"], b["blue"]["club"]) for b in first_round if b["red"] and b["blue"]]
check("club-mates are kept apart where possible (rule 1)",
      all(a != b for a, b in clubs), clubs)

status, body = call("POST", "/api/admin/tournaments/divisions/%d/draw/publish" % division_id, token=TOKEN)
check("the draw is published", status == 200 and body["drawPublishedAt"] is not None, body)

status, body = call("POST", "/api/admin/tournaments/divisions/%d/draw" % division_id,
                    {"seed": 99}, token=TOKEN)
check("redrawing a published draw needs a reason (rule 6)", status == 400, status)

status, body = call("POST", "/api/admin/tournaments/divisions/%d/draw" % division_id,
                    {"seed": 99, "reason": "Two athletes were in the wrong class."}, token=TOKEN)
check("with a reason it is allowed", status == 200, body)
call("POST", "/api/admin/tournaments/divisions/%d/draw/publish" % division_id, token=TOKEN)

status, audit = call("GET", "/api/admin/audit?action=tournament.draw_amended", token=TOKEN)
check("the amendment is logged", audit["total"] >= 1, audit["total"])

say("")
say("=== REQ-10 rule 8: withdrawing after the draw ===")
status, bracket = call("GET", "/api/admin/tournaments/divisions/%d/draw" % division_id, token=TOKEN)
victim = bracket["rounds"][0]["bouts"][0]["red"]["id"]
status, _ = call("POST", "/api/admin/tournaments/entries/%d/withdraw" % victim,
                 {"reason": "Injured in training."}, token=TOKEN)
status, after = call("GET", "/api/admin/tournaments/divisions/%d/draw" % division_id, token=TOKEN)
bout = after["rounds"][0]["bouts"][0]
check("their opponent advances as a walkover", bout["isWalkover"] is True, bout)
check("a walkover does not rename a full first round",
      after["rounds"][0]["nameEn"] == "Quarter-final", after["rounds"][0]["nameEn"])

say("")
say("=== REQ-11: rings, scheduling and numbering ===")

status, body = call("POST", "/api/admin/tournaments/%d/schedule/generate" % TID, {}, token=TOKEN)
check("generating with no rings is refused", status == 409, status)

status, ringA = call("POST", "/api/admin/tournaments/%d/rings" % TID,
                     {"name": "Ring A", "firstBoutTime": "17:00:00", "intervalMinutes": 15}, token=TOKEN)
check("a ring can be added (rule 5)", status == 200, ringA)
status, ringB = call("POST", "/api/admin/tournaments/%d/rings" % TID,
                     {"name": "Ring B", "firstBoutTime": "17:00:00", "intervalMinutes": 20}, token=TOKEN)
check("and a second", status == 200, ringB)

status, dup = call("POST", "/api/admin/tournaments/%d/rings" % TID, {"name": "Ring A"}, token=TOKEN)
check("two rings cannot share a name", status == 409, status)

status, body = call("PUT", "/api/admin/tournaments/divisions/%d/schedule" % division_id,
                    {"ringId": ringA["id"], "date": "%d-12-01" % YEAR}, token=TOKEN)
check("a division is given a ring and a day", status == 200, body)

status, schedule = call("GET", "/api/admin/tournaments/%d/schedule" % TID, token=TOKEN)
scheduled = [b for c in schedule["categories"] for d in c["divisions"] for b in d["bouts"]]
check("the bouts are scheduled", len(scheduled) > 0, len(scheduled))
check("every scheduled bout has a time and a number",
      all(b["startTime"] and b["boutNumber"] for b in scheduled))
check("they all sit in Ring A", {b["ringName"] for b in scheduled} == {"Ring A"},
      {b["ringName"] for b in scheduled})

times = sorted(b["startTime"] for b in scheduled)
check("times run at 15-minute intervals from 17:00",
      times[0].startswith("17:00") and times[1].startswith("17:15"), times[:3])

numbers = sorted(b["boutNumber"] for b in scheduled)
check("bout numbers are sequential from 1", numbers == list(range(1, len(numbers) + 1)), numbers)

# move one bout to the other ring and confirm it sticks
movable = scheduled[0]["id"]
status, _ = call("PUT", "/api/admin/tournaments/bouts/%d/slot" % movable,
                 {"ringId": ringB["id"]}, token=TOKEN)
status, schedule = call("GET", "/api/admin/tournaments/%d/schedule" % TID, token=TOKEN)
scheduled = [b for c in schedule["categories"] for d in c["divisions"] for b in d["bouts"]]
moved = next(b for b in scheduled if b["id"] == movable)
check("a bout moved by hand stays in its ring (rule 7)",
      moved["ringId"] == ringB["id"] and moved["ringPinned"] is True, moved)
check("the rest stay in Ring A",
      {b["ringName"] for b in scheduled if b["id"] != movable} == {"Ring A"})

status, body = call("POST", "/api/admin/tournaments/%d/schedule/generate" % TID, {}, token=TOKEN)
regenerated = [b for c in body["categories"] for d in c["divisions"] for b in d["bouts"]]
still = next(b for b in regenerated if b["id"] == movable)
check("regenerating leaves the pinned bout where it was", still["ringId"] == ringB["id"])

check("no athlete clashes are reported", len(body["clashes"]) == 0,
      [c["messageEn"] for c in body["clashes"]])

say("")
say("=== permissions ===")
status, _ = call("GET", "/api/admin/tournaments")
check("the tournament list refuses an anonymous caller", status in (401, 403), status)

say("")
say("=" * 60)
say("FAILED: " + (", ".join(failures) if failures else "none"))
# A copy of the run, if somewhere to put it was named.
LOG_PATH = os.environ.get("SMF_TEST_LOG")
if LOG_PATH:
    io.open(LOG_PATH, "w", encoding="utf-8").write(chr(10).join(log) + chr(10))
sys.exit(1 if failures else 0)
