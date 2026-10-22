"""
The parts of the Phase 3 Part 1 document that the second reading pinned down:
the official Weight Class Mapping, the create-then-approve permission pairs
each stage asks for, approving the running order, and the scheduling rules
about future-round bouts, byes and bout numbers.

These live apart from test_gaps.py because they are not gaps that were left
open — they are rules the document states exactly, with its own worked
numbers, and the point of the suite is to hold the system to those numbers.
"""
import json, sys, os, uuid, urllib.request, urllib.error, datetime, sqlite3

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
            text = response.read().decode("utf-8", "replace")
            return response.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", "replace")
        try:
            return error.code, json.loads(text)
        except ValueError:
            return error.code, text


def sql(query, args=()):
    con = sqlite3.connect(DB)
    try:
        rows = con.execute(query, args).fetchall()
        con.commit()
        return rows
    finally:
        con.close()


status, body = call("POST", "/api/auth/login", {"username": "admin", "password": "Admin@123"})
TOKEN = body["token"]


def make_athlete(age, gender="male", weight="60", club="BRD Club"):
    payload = {
        "firstNameAr": "علي", "fatherNameAr": "محمد", "familyNameAr": "الحربي",
        "firstNameEn": "Ali", "fatherNameEn": "Mohammed",
        "familyNameEn": "Al" + "".join(chr(97 + (b % 26)) for b in uuid.uuid4().bytes[:5]),
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": "%d-06-15" % (YEAR - age), "nationality": "SA", "gender": gender,
        "phone": "+966512345678", "email": "b%s@example.com" % uuid.uuid4().hex[:8],
        "region": "الرياض", "city": "الرياض",
        "paraAthlete": "no", "currentWeight": weight, "clubName": club,
        "consent": True,
    }
    if age < 19:
        payload.update({"guardianName": "ولي الأمر", "guardianPhone": "+966512345670",
                        "guardianRelation": "father"})

    st, created = call("POST", "/api/registrations", {"type": "athlete", "payload": payload})
    assert st == 200, created
    rid = sql("select Id from Registrations where ReferenceNumber=?", (created["referenceNumber"],))[0][0]
    for step in ("under_review", "awaiting_approval"):
        call("PUT", "/api/admin/registrations/%d/status" % rid, {"status": step}, token=TOKEN)
    call("PUT", "/api/admin/registrations/%d/status" % rid,
         {"status": "approved", "membershipNumber": "SMF-B-%d" % rid}, token=TOKEN)
    return rid


# =========================================================================
say("=== REQ-01: the Weight Class Mapping, as the API serves it ===")


def ladder(category, gender):
    status, rows = call(
        "GET", "/api/admin/tournaments/weight-classes?category=%s&gender=%s" % (category, gender),
        token=TOKEN)
    assert status == 200, rows
    return [("+%g" % r["floorKg"]) if r["limitKg"] is None else ("%g" % r["limitKg"]) for r in rows]


check("U18 men run 45 up to 91 and then open",
      ladder("u18", "male")
      == ["45", "48", "51", "54", "57", "60", "63.5", "67", "71", "75", "81", "86", "91", "+91"],
      ladder("u18", "male"))

check("U18 women start a class lower, at 42, and close at +75",
      ladder("u18", "female")
      == ["42", "45", "48", "51", "54", "57", "60", "63.5", "67", "71", "75", "+75"],
      ladder("u18", "female"))

check("U14 counts in twos to 60, then 63.5, then open",
      ladder("u14", "female")
      == ["32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58",
          "60", "63.5", "+63.5"],
      ladder("u14", "female"))

check("U10 is the same ten classes for boys and girls",
      ladder("u10", "male") == ladder("u10", "female")
      == ["18", "20", "22", "24", "26", "28", "30", "32", "34", "36"],
      ladder("u10", "male"))

check("and U10 has no open class at the top",
      not any(c.startswith("+") for c in ladder("u10", "male")))

check("U8 boys have one class more than U8 girls",
      ladder("u8", "male") == ["16", "18", "20", "22", "24", "26", "28"]
      and ladder("u8", "female") == ["16", "18", "20", "22", "24", "26"],
      "%s / %s" % (ladder("u8", "male"), ladder("u8", "female")))

check("the three Masters bands run the Elite ladder",
      ladder("masters_35", "male") == ladder("masters_40", "male")
      == ladder("masters_45", "male") == ladder("elite", "male"))


# =========================================================================
say("")
say("=== REQ-01 rules 10 and 11: making a tournament and approving it are separate ===")


def make_role(key, permissions):
    status, role = call("POST", "/api/admin/roles", {
        "key": key, "nameAr": "دور اختبار", "nameEn": "Test role",
        "descriptionAr": "", "descriptionEn": "", "permissions": permissions,
    }, token=TOKEN)
    assert status in (200, 201), role
    return role["id"]


def make_user(username, role_id):
    password = "Brd@%s1" % uuid.uuid4().hex[:6]
    status, user = call("POST", "/api/admin/users", {
        "username": username, "displayName": "BRD " + username,
        "password": password, "isActive": True, "roleIds": [role_id],
    }, token=TOKEN)
    assert status in (200, 201), user
    status, signed = call("POST", "/api/auth/login", {"username": username, "password": password})
    assert status == 200, signed
    return signed["token"]


tag = uuid.uuid4().hex[:6]
CREATOR = make_user("brd.maker." + tag, make_role("brd_maker_" + tag, ["tournament.manage"]))
APPROVER = make_user("brd.appr." + tag, make_role("brd_appr_" + tag, ["tournament.approve"]))

setup = {
    "nameAr": "بطولة المستند", "nameEn": "Document Championship",
    "type": "kingdom", "competitionType": "muaythai_combat",
    "locationAr": "جدة", "locationEn": "Jeddah",
    "startDate": "%d-11-20" % YEAR, "endDate": "%d-11-20" % YEAR,
    "firstBoutTime": "17:00:00", "boutIntervalMinutes": 10,
    "registrationOpensAt": "%d-01-01T00:00:00" % YEAR,
    "registrationClosesAt": "%d-11-10T00:00:00" % YEAR,
    "genders": ["male"], "categories": ["u18"],
}

status, refused = call("POST", "/api/admin/tournaments", setup, token=APPROVER)
check("the approver cannot create a tournament", status == 403, status)

status, made = call("POST", "/api/admin/tournaments", setup, token=CREATOR)
check("the creator can", status in (200, 201), made)
TOURNAMENT = made["id"]

status, _ = call("POST", "/api/admin/tournaments/%d/publish" % TOURNAMENT, token=CREATOR)
check("but the creator cannot publish it", status == 403, status)
check("so it is still unpublished",
      sql("select PublishedAt from Tournaments where Id=?", (TOURNAMENT,))[0][0] is None)

status, published = call("POST", "/api/admin/tournaments/%d/publish" % TOURNAMENT, token=APPROVER)
check("the approver can, and that is what opens entries", status == 200, published)
check("now it is published",
      sql("select PublishedAt from Tournaments where Id=?", (TOURNAMENT,))[0][0] is not None)

status, listed = call("GET", "/api/admin/access/permissions", token=TOKEN)
keys = [p["key"] for group in listed for p in group["permissions"]]
check("each stage offers its own approval permission",
      {"tournament.approve", "tournament.entries.approve",
       "tournament.draw.approve", "tournament.schedule.approve"} <= set(keys),
      sorted(k for k in keys if str(k).startswith("tournament.")))


# =========================================================================
say("")
say("=== REQ-10 and REQ-11: a bracket, then a running order ===")

status, detail = call("GET", "/api/admin/tournaments/%d" % TOURNAMENT, token=TOKEN)
DIVISION = next(d["id"] for d in detail["divisions"] if str(d["weightLimitKg"]) == "45.0")

# Three athletes, so the draw has one bye and a real bout: enough to check
# that a bye is left out of the running order and the final is kept in.
ready = []
for index in range(3):
    rid = make_athlete(16, weight="44")
    st, entry = call("POST", "/api/admin/tournaments/%d/entries" % TOURNAMENT,
                     {"athleteRegistrationId": rid, "divisionId": DIVISION,
                      "declaredWeightKg": 44, "clubName": "Club %d" % index}, token=TOKEN)
    if st == 200:
        ready.append(entry["id"])

for entry in ready:
    call("POST", "/api/admin/tournaments/entries/%d/check-in" % entry, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/medical" % entry,
         {"result": "passed", "note": None, "documentsMissing": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % entry,
         {"weightKg": 44, "result": "passed", "noShow": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/approve" % entry, token=TOKEN)

status, drawn = call("POST", "/api/admin/tournaments/divisions/%d/draw" % DIVISION,
                     {"seed": 7}, token=TOKEN)
check("three athletes draw", status == 200, drawn)

bouts = sql("select Id, Round, Position, IsBye, RedEntryId, BlueEntryId from Bouts "
            "where DivisionId=? order by Round, Position", (DIVISION,))
check("three athletes give one bye and two bouts", len(bouts) == 3, bouts)
check("the bye is seated first, before the contested bout",
      bouts[0][3] == 1 and bouts[1][3] == 0, [(b[1], b[2], b[3]) for b in bouts])
# The bye athlete does not fight in round one, so the draw walks them
# straight into the final; the other corner waits for the contested bout.
check("the round above is the final, with the bye athlete already in it",
      bouts[2][1] == 2 and bouts[2][4] == bouts[0][4] and bouts[2][5] is None, bouts[2])

call("POST", "/api/admin/tournaments/divisions/%d/draw/publish" % DIVISION, token=TOKEN)

status, ringA = call("POST", "/api/admin/tournaments/%d/rings" % TOURNAMENT,
                     {"name": "Ring A", "firstBoutTime": "17:00:00", "intervalMinutes": 30},
                     token=TOKEN)
check("a ring is added at scheduling time, not at setup (rule 8)", status == 200, ringA)

call("PUT", "/api/admin/tournaments/divisions/%d/schedule" % DIVISION,
     {"ringId": ringA["id"], "date": "%d-11-20" % YEAR}, token=TOKEN)

status, _ = call("POST", "/api/admin/tournaments/%d/schedule/generate" % TOURNAMENT, {}, token=TOKEN)
check("the running order is generated", status == 200, status)

numbered = sql("select Round, IsBye, BoutNumber, StartTime, RingId from Bouts "
               "where DivisionId=? order by Round, Position", (DIVISION,))

check("the bye gets no number, no ring and no time (rule 3)",
      numbered[0][1] == 1 and numbered[0][2] is None
      and numbered[0][3] is None and numbered[0][4] is None,
      numbered[0])

check("the contested bout is numbered 1 at 17:00",
      numbered[1][2] == 1 and str(numbered[1][3]).startswith("17:00"), numbered[1])

# REQ-11 rule 11 — the final is a real bout and is scheduled before anybody
# knows who will be in it.
check("the final is scheduled although its corners are empty (rule 11)",
      numbered[2][2] == 2 and str(numbered[2][3]).startswith("17:30"), numbered[2])


# =========================================================================
say("")
say("=== REQ-11 rule 12: bout numbers follow the clock, not the ring ===")

status, ringB = call("POST", "/api/admin/tournaments/%d/rings" % TOURNAMENT,
                     {"name": "Ring B", "firstBoutTime": "14:00:00", "intervalMinutes": 30},
                     token=TOKEN)
check("a second ring opens earlier than the first", status == 200, ringB)

status, second = call("GET", "/api/admin/tournaments/%d" % TOURNAMENT, token=TOKEN)
OTHER = next(d["id"] for d in second["divisions"] if str(d["weightLimitKg"]) == "48.0")

pair = []
for index in range(2):
    rid = make_athlete(16, weight="47")
    st, entry = call("POST", "/api/admin/tournaments/%d/entries" % TOURNAMENT,
                     {"athleteRegistrationId": rid, "divisionId": OTHER,
                      "declaredWeightKg": 47, "clubName": "Late %d" % index}, token=TOKEN)
    if st == 200:
        pair.append(entry["id"])

for entry in pair:
    call("POST", "/api/admin/tournaments/entries/%d/check-in" % entry, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/medical" % entry,
         {"result": "passed", "note": None, "documentsMissing": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % entry,
         {"weightKg": 47, "result": "passed", "noShow": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/approve" % entry, token=TOKEN)

call("POST", "/api/admin/tournaments/divisions/%d/draw" % OTHER, {"seed": 11}, token=TOKEN)
call("POST", "/api/admin/tournaments/divisions/%d/draw/publish" % OTHER, token=TOKEN)
call("PUT", "/api/admin/tournaments/divisions/%d/schedule" % OTHER,
     {"ringId": ringB["id"], "date": "%d-11-20" % YEAR}, token=TOKEN)

status, _ = call("POST", "/api/admin/tournaments/%d/schedule/generate" % TOURNAMENT, {}, token=TOKEN)
check("the order is regenerated with both rings", status == 200, status)

ordered = sql("select BoutNumber, StartTime, RingId from Bouts "
              "where BoutNumber is not null and DivisionId in (?, ?) order by BoutNumber",
              (DIVISION, OTHER))

check("bout 1 is the one that starts earliest, in the later-added ring",
      ordered[0][2] == ringB["id"] and str(ordered[0][1]).startswith("14:00"), ordered[0])
check("the numbers run in start-time order across the two rings",
      [row[1] for row in ordered] == sorted(row[1] for row in ordered),
      [(row[0], str(row[1])[:5]) for row in ordered])


# =========================================================================
say("")
say("=== REQ-11 rule 14: the running order is approved, and an edit undoes that ===")

check("it is not approved just by being generated",
      sql("select ScheduleApprovedAt from Tournaments where Id=?", (TOURNAMENT,))[0][0] is None)

status, _ = call("POST", "/api/admin/tournaments/%d/schedule/approve" % TOURNAMENT, token=CREATOR)
check("the person who made it cannot also approve it", status == 403, status)

SCHEDULER = make_user("brd.sched." + tag, make_role("brd_sched_" + tag, ["tournament.schedule.approve"]))

status, approved = call("POST", "/api/admin/tournaments/%d/schedule/approve" % TOURNAMENT,
                        token=SCHEDULER)
check("the approver can", status == 200, approved)
check("and it is recorded against them",
      sql("select ScheduleApprovedBy from Tournaments where Id=?",
          (TOURNAMENT,))[0][0] == "brd.sched." + tag)

status, _ = call("POST", "/api/admin/tournaments/%d/schedule/generate" % TOURNAMENT, {}, token=TOKEN)
check("regenerating the order drops the approval", status == 200, status)
check("so it has to be signed off again",
      sql("select ScheduleApprovedAt from Tournaments where Id=?", (TOURNAMENT,))[0][0] is None)

status, nothing = call("POST", "/api/admin/tournaments/999999/schedule/approve", token=SCHEDULER)
check("a tournament that does not exist has no schedule to approve", status == 404, status)

say("")
say("=" * 60)
say("FAILED: " + (", ".join(failures) if failures else "none"))
LOG_PATH = os.environ.get("SMF_TEST_LOG")
if LOG_PATH:
    open(LOG_PATH, "w", encoding="utf-8").write("\n".join(log) + "\n")
sys.exit(1 if failures else 0)
