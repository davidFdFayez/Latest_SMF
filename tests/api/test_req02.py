"""
REQ-02 — Configure Competition Divisions, through the API.

The age table itself is checked in tests/logic (Req02Tests). These are the
rules that need the whole system: the tournament's own year deciding age, a
tournament running only some divisions, the athlete's gender coming from their
record, one category per tournament, and nobody — by query string, body or
another athlete's id — getting an answer the server did not work out from
their own account.
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
    request = urllib.request.Request(API + path, data=data, method=method, headers=head)
    try:
        with urllib.request.urlopen(request) as response:
            text = response.read().decode()
            return response.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        try:
            return error.code, json.loads(text)
        except ValueError:
            return error.code, text


def sql(query, args=()):
    connection = sqlite3.connect(DB)
    try:
        rows = connection.execute(query, args).fetchall()
        connection.commit()
        return rows
    finally:
        connection.close()


status, body = call("POST", "/api/auth/login", {"username": "admin", "password": "Admin@123"})
ADMIN = body["token"]


def latin(n=5):
    return "".join(chr(97 + (uuid.uuid4().int >> i) % 26) for i in range(n))


def approve(rid):
    for step in ("under_review", "awaiting_approval"):
        call("PUT", "/api/admin/registrations/%d/status" % rid, {"status": step}, token=ADMIN)
    call("PUT", "/api/admin/registrations/%d/status" % rid,
         {"status": "approved", "membershipNumber": "SMF-R2-%d" % rid}, token=ADMIN)


def athlete(born, gender="male"):
    """An approved athlete born on that date, signed in (development sign-in)."""
    email = "req02%s@example.com" % uuid.uuid4().hex[:8]
    payload = {
        "firstNameAr": "سالم", "fatherNameAr": "علي", "familyNameAr": "الغامدي",
        "firstNameEn": "Salem", "fatherNameEn": "Ali", "familyNameEn": "Al" + latin(),
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": born, "nationality": "SA", "gender": gender,
        "phone": "+966512345678", "email": email, "region": "منطقة الرياض", "city": "الرياض",
        "paraAthlete": "no", "currentWeight": "60", "consent": True,
    }
    if YEAR - int(born[:4]) < 19:
        payload.update({"guardianName": "G", "guardianPhone": "+966512345670", "guardianRelation": "father"})
    st, made = call("POST", "/api/registrations", {"type": "athlete", "payload": payload})
    assert st == 200, made
    rid = sql("select Id from Registrations where ReferenceNumber=?", (made["referenceNumber"],))[0][0]
    approve(rid)
    st, signed = call("POST", "/api/member/login", {"email": email, "password": "123"})
    assert st == 200, signed
    return rid, signed["token"]


def set_payload(rid, field, value):
    """Changes the stored record directly, as an administrator's correction would."""
    sql("update Registrations set PayloadJson = json_set(PayloadJson, '$.' || ?, ?) where Id=?", (field, value, rid))


def tournament(year, categories, genders, weights=None, exact=False, publish=True):
    body = {
        "nameAr": "بطولة الأقسام", "nameEn": "Divisions Cup " + latin(),
        "type": "local", "competitionType": "muaythai_combat",
        "locationAr": "الرياض", "locationEn": "Riyadh",
        "startDate": "%d-03-10" % year if year > YEAR else "%d-12-10" % year,
        "endDate": "%d-03-11" % year if year > YEAR else "%d-12-11" % year,
        "registrationClosesAt": ("%d-02-01T00:00:00" % year) if year > YEAR else ("%d-12-01T00:00:00" % year),
        "firstBoutTime": "17:00:00",
        "genders": genders, "categories": categories, "activityCategory": "regional",
        "exactWeightClasses": exact,
    }
    if weights:
        body["weightClasses"] = weights
    st, made = call("POST", "/api/admin/tournaments", body, token=ADMIN)
    assert st in (200, 201), made
    if publish:
        call("POST", "/api/admin/tournaments/%d/publish" % made["id"], token=ADMIN)
    return made["id"]


def eligibility(tid, token, query=""):
    return call("GET", "/api/member/tournaments/%d/eligibility%s" % (tid, query), token=token)


def offered(verdict):
    """What the tournament offers: category -> list of weight labels, in order."""
    return [(o["category"], [d["labelEn"].split(" – ")[-1] for d in o["divisions"]]) for o in verdict["eligibleCategories"]]


# A tournament this year running only some divisions, exactly as picked.
T = tournament(YEAR, ["u18", "u24", "elite"], ["male", "female"], exact=True, weights={
    "u24:male": [60, 67],
    "elite:male": [60, 67, 71],
    "elite:female": [57],
})

say("")
say("=== competition age is the tournament's year minus the birth year ===")

m18_id, M18 = athlete("%d-06-15" % (YEAR - 18), "male")
status, v = eligibility(T, M18)
check("an athlete reads their eligibility for an open tournament", status == 200, v)
check("tournament year and competition age 18",
      v["tournamentYear"] == YEAR and v["competitionAge"] == 18, (v.get("tournamentYear"), v.get("competitionAge")))
check("age 18 → U24 and Elite, both",
      [c["value"] for c in v["ageEligibleCategories"]] == ["u24", "elite"], v["ageEligibleCategories"])
check("gender from the record", v["gender"] == "male", v.get("gender"))

jan_id, JAN = athlete("%d-01-01" % (YEAR - 18), "male")
dec_id, DEC = athlete("%d-12-31" % (YEAR - 18), "male")
check("1 January and 31 December of the same year give the same age and categories",
      eligibility(T, JAN)[1]["competitionAge"] == eligibility(T, DEC)[1]["competitionAge"] == 18
      and [c["value"] for c in eligibility(T, DEC)[1]["ageEligibleCategories"]] == ["u24", "elite"])

# Next year's tournament: the same athlete is a year older there, today notwithstanding.
NEXT = tournament(YEAR + 1, ["u18", "u24", "elite"], ["male"])
y17_id, Y17 = athlete("%d-06-15" % (YEAR - 17), "male")
now_v, next_v = eligibility(T, Y17)[1], eligibility(NEXT, Y17)[1]
check("the tournament's year decides: 17 → U18 this year",
      now_v["competitionAge"] == 17 and [c["value"] for c in now_v["ageEligibleCategories"]] == ["u18"], now_v["ageEligibleCategories"])
check("and 18 → U24 + Elite in next year's tournament",
      next_v["tournamentYear"] == YEAR + 1 and next_v["competitionAge"] == 18
      and [c["value"] for c in next_v["ageEligibleCategories"]] == ["u24", "elite"], next_v["ageEligibleCategories"])

say("")
say("=== the tournament's own divisions narrow what is offered ===")

check("a man of 18 is offered U24 and Elite, youngest first, each at only the classes picked",
      offered(v) == [("u24", ["60 kg", "67 kg"]), ("elite", ["60 kg", "67 kg", "71 kg"])], offered(v))
check("a Division is Category + Gender + Weight Class: U24 60 kg and Elite 60 kg are different divisions",
      len({d["divisionId"] for o in v["eligibleCategories"] for d in o["divisions"]}) == 5)

f18_id, F18 = athlete("%d-06-15" % (YEAR - 18), "female")
fv = eligibility(T, F18)[1]
check("a woman of 18 is age-eligible for U24 and Elite too",
      [c["value"] for c in fv["ageEligibleCategories"]] == ["u24", "elite"])
check("but the tournament runs no women's U24, so only Elite 57 kg is offered",
      offered(fv) == [("elite", ["57 kg"])], offered(fv))
check("and the age list says which ones the tournament offers",
      {c["value"]: c["offered"] for c in fv["ageEligibleCategories"]} == {"u24": False, "elite": True})
check("none of the men's classes reach her",
      all(d["labelEn"].startswith("Female") for o in fv["eligibleCategories"] for d in o["divisions"]))

m16_id, M16 = athlete("%d-06-15" % (YEAR - 16), "male")
nv = eligibility(T, M16)[1]
check("a boy of 16 is U18, which this tournament runs in no class for men",
      [c["value"] for c in nv["ageEligibleCategories"]] == ["u18"] and nv["noEligibleDivision"] is True
      and nv["eligibleCategories"] == [] and nv["canEnter"] is False, nv)
check("said plainly", any(b["code"] == "no_eligible_category" for b in nv["barriers"]), nv["barriers"])

m35_id, M35 = athlete("%d-06-15" % (YEAR - 35), "male")
v35 = eligibility(T, M35)[1]
check("age 35 → Elite and Masters 35+",
      [c["value"] for c in v35["ageEligibleCategories"]] == ["elite", "masters_35"], v35["ageEligibleCategories"])
check("this tournament runs no Masters, so Elite alone is offered", offered(v35) == [("elite", ["60 kg", "67 kg", "71 kg"])])

m40_id, M40 = athlete("%d-06-15" % (YEAR - 40), "male")
check("age 40 → Elite and Masters 40+",
      [c["value"] for c in eligibility(T, M40)[1]["ageEligibleCategories"]] == ["elite", "masters_40"])

# Below and above the table: no category at all.
for age in (5, 51):
    rid, token = (m18_id, M18) if age == 5 else (m35_id, M35)
    set_payload(rid, "dateOfBirth", "%d-06-15" % (YEAR - age))
    out = eligibility(T, token)[1]
    check("age %d → no eligible category" % age,
          out["competitionAge"] == age and out["ageEligibleCategories"] == [] and out["noEligibleDivision"] is True, out)
set_payload(m18_id, "dateOfBirth", "%d-06-15" % (YEAR - 18))
set_payload(m35_id, "dateOfBirth", "%d-06-15" % (YEAR - 35))

# A division the official table does not list is never offered, whatever is stored.
sql("insert into TournamentDivisions (TournamentId, Category, Gender, WeightLimitKg, WeightFloorKg) "
    "values (?, 'elite', 'male', 50, 48)", (T,))
check("a stored division outside the official weight table is not offered",
      all("50 kg" not in label for _, labels in offered(eligibility(T, M18)[1]) for label in labels))

say("")
say("=== gender comes from the record, never from the request ===")

spoof = eligibility(T, M18, "?gender=female&dateOfBirth=1990-01-01&athleteRegistrationId=%d" % f18_id)[1]
check("a query naming another gender, date of birth or athlete changes nothing",
      spoof["gender"] == "male" and spoof["competitionAge"] == 18 and offered(spoof) == offered(v), spoof.get("gender"))

women_57 = fv["eligibleCategories"][0]["divisions"][0]["divisionId"]
status, refused = call("POST", "/api/member/tournaments/%d/entries" % T,
                       {"athleteRegistrationId": m18_id, "divisionId": women_57,
                        "gender": "female", "dateOfBirth": "1990-01-01"}, token=M18)
check("a man cannot enter a women's division by saying he is female", status == 409, refused)

ng_id, NG = athlete("%d-06-15" % (YEAR - 20), "male")
set_payload(ng_id, "gender", "")
nog = eligibility(T, NG)[1]
check("a record with no gender matches no division, not every division",
      nog["gender"] is None and nog["eligibleCategories"] == [] and any(b["code"] == "no_gender" for b in nog["barriers"]), nog)
set_payload(ng_id, "gender", "other")
check("nor does an unrecognised gender", eligibility(T, NG)[1]["eligibleCategories"] == [])

say("")
say("=== one category per athlete per tournament ===")

u24_60 = v["eligibleCategories"][0]["divisions"][0]["divisionId"]
elite_67 = v["eligibleCategories"][1]["divisions"][1]["divisionId"]
status, wrong = call("POST", "/api/member/tournaments/%d/entries" % T,
                     {"athleteRegistrationId": m18_id, "divisionId": u24_60, "category": "elite"}, token=M18)
check("naming one category with another category's division is refused", status == 400, wrong)
status, entered = call("POST", "/api/member/tournaments/%d/entries" % T,
                       {"athleteRegistrationId": m18_id, "divisionId": u24_60}, token=M18)
check("the athlete enters U24 60 kg", status == 200, entered)
status, second = call("POST", "/api/member/tournaments/%d/entries" % T,
                      {"athleteRegistrationId": m18_id, "divisionId": elite_67}, token=M18)
check("and cannot then enter Elite in the same tournament", status == 409, second)
after = eligibility(T, M18)[1]
check("their eligibility shows the entry they hold, and its category",
      after["existingEntry"] and after["existingEntry"]["category"] == "u24"
      and after["existingEntry"]["divisionId"] == u24_60 and after["canEnter"] is False, after.get("existingEntry"))
check("one entry in the database", sql("select count(*) from TournamentEntries where TournamentId=? and AthleteRegistrationId=?",
                                        (T, m18_id))[0][0] == 1)
status, elsewhere = call("POST", "/api/member/tournaments/%d/entries" % NEXT,
                         {"athleteRegistrationId": m18_id, "divisionId": eligibility(NEXT, M18)[1]["eligibleCategories"][-1]["divisions"][0]["divisionId"]},
                         token=M18)
check("a different tournament is a separate choice", status == 200, elsewhere)

say("")
say("=== nobody reads or uses another athlete's eligibility ===")

status, _ = call("POST", "/api/member/tournaments/%d/entries" % T,
                 {"athleteRegistrationId": f18_id, "divisionId": women_57}, token=M18)
check("an athlete cannot enter another athlete", status == 403, status)
check("the eligibility route takes no athlete: it is the caller's own",
      eligibility(T, F18)[1]["gender"] == "female" and eligibility(T, M18)[1]["gender"] == "male")
status, _ = call("GET", "/api/member/tournaments/%d/eligible" % T, token=M18)
check("the roster-wide list, for an athlete, holds only themselves",
      status == 200 and [a["registrationId"] for a in _] == [m18_id], _)
check("signed out, nothing", eligibility(T, None)[0] in (401, 403))

say("")
say("=== tournaments members cannot see ===")

DRAFT = tournament(YEAR, ["elite"], ["male"], publish=False)
check("a draft tournament does not exist for a member", eligibility(DRAFT, M18)[0] == 404)
check("nor in the roster-wide list", call("GET", "/api/member/tournaments/%d/eligible" % DRAFT, token=M18)[0] == 404)
check("an unknown tournament is not found", eligibility(999999, M18)[0] == 404)

say("")
say("=" * 60)
say("FAILED: " + (", ".join(failures) if failures else "none"))
sys.exit(1 if failures else 0)
