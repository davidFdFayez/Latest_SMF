"""
Weigh-in accepted range — the SMTF weigh-in policy of 2026-11-14, against
each division's own official list (category and gender), through the API.

* first class: limit - 2.00 kg to the limit, both inclusive;
* every later class: above the preceding OFFICIAL limit (exclusive) up to its
  own limit (inclusive) - even when the tournament does not run that class;
* open "+" class: above the preceding official limit, no upper limit;
* weights to at most two decimal places, refused (never rounded) otherwise;
* Final Draw Approval and the draw pool rest on a weigh-in that holds for the
  athlete's CURRENT class; a class or category change clears a weigh-in result
  and approval only with a reason, and says so in the audit.

The server decides; nothing the client sends about a match is trusted.
"""
import json, sys, os, uuid, urllib.request, urllib.error, datetime, sqlite3

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = os.environ.get("SMF_TEST_API", "http://127.0.0.1:5197")
DB = os.environ["SMF_TEST_DB"]
TODAY = datetime.date.today()
START = TODAY + datetime.timedelta(days=40)
YEAR = START.year
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
            raw = response.read()
            if not response.headers.get("Content-Type", "").startswith("application/json"):
                return response.status, raw
            text = raw.decode()
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
         {"status": "approved", "membershipNumber": "SMF-R3-%d" % rid}, token=ADMIN)


def register(kind, payload):
    st, made = call("POST", "/api/registrations", {"type": kind, "payload": payload})
    assert st == 200, made
    rid = sql("select Id from Registrations where ReferenceNumber=?", (made["referenceNumber"],))[0][0]
    approve(rid)
    return rid


def sign_in(email):
    st, signed = call("POST", "/api/member/login", {"email": email, "password": "123"})
    assert st == 200, signed
    return signed["token"]


def athlete(age, gender="male", **extra):
    email = "r3a%s@example.com" % uuid.uuid4().hex[:8]
    payload = {
        "firstNameAr": "فهد", "fatherNameAr": "علي", "familyNameAr": "الحربي",
        "firstNameEn": "Fahad", "fatherNameEn": "Ali", "familyNameEn": "Al" + latin(),
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": "%d-06-15" % (YEAR - age), "nationality": "SA", "gender": gender,
        "phone": "+966512345678", "email": email, "region": "منطقة الرياض", "city": "الرياض",
        "paraAthlete": "no", "currentWeight": "50", "height": "170",
        "clubName": "مركز الحربي", "coachName": "مدرب الحربي", "coachPhone": "+966512340009",
        "consent": True,
    }
    payload.update(extra)
    if TODAY.year - int(payload["dateOfBirth"][:4]) < 19:
        payload.update({"guardianName": "G", "guardianPhone": "+966512345670", "guardianRelation": "father"})
    rid = register("athlete", payload)
    return rid, email, sign_in(email)

def tournament(categories, genders, weights=None):
    st, made = call("POST", "/api/admin/tournaments", {
        "nameAr": "بطولة التسجيل", "nameEn": "Registration Cup " + latin(),
        "type": "local", "competitionType": "muaythai_combat",
        "locationAr": "الرياض", "locationEn": "Riyadh",
        "startDate": START.isoformat(), "endDate": (START + datetime.timedelta(days=1)).isoformat(),
        "registrationClosesAt": (TODAY + datetime.timedelta(days=30)).isoformat() + "T00:00:00",
        "firstBoutTime": "17:00:00", "genders": genders, "categories": categories,
        "activityCategory": "regional", "exactWeightClasses": weights is not None,
        "weightClasses": weights or {},
    }, token=ADMIN)
    assert st in (200, 201), made
    call("POST", "/api/admin/tournaments/%d/publish" % made["id"], token=ADMIN)
    return made["id"]


def base(path):
    return "/api/admin/tournaments" + path


def readiness(token=ADMIN):
    return call("GET", base("/%d/readiness" % T), token=token)


def row(entry_id, token=ADMIN):
    return next(a for a in readiness(token)[1]["athletes"] if a["id"] == entry_id)


def check_in(entry_id, token=ADMIN):
    return call("POST", base("/entries/%d/check-in" % entry_id), token=token)


# A pass here is mostly for athletes without a complete Medical File, so it
# carries the reason REQ-08 rule 6 asks for; pass missing_reason=None to leave it out.
def medical(entry_id, result, note=None, missing=True, correction=None, token=ADMIN,
            missing_reason="Documents to be brought on the day."):
    return call("POST", base("/entries/%d/medical" % entry_id),
                {"result": result, "note": note, "documentsMissing": missing,
                 "correctionReason": correction,
                 "missingDocumentsReason": missing_reason if result == "passed" else None}, token=token)


def preview(entry_id, kg, token=ADMIN):
    return call("GET", base("/entries/%d/weigh-in/preview?weightKg=%s" % (entry_id, kg)), token=token)


def weigh(entry_id, kg, result, reason=None, token=ADMIN):
    return call("POST", base("/entries/%d/weigh-in" % entry_id),
                {"weightKg": kg, "result": result, "noShow": False, "reason": reason}, token=token)


def no_show(entry_id, token=ADMIN):
    return call("POST", base("/entries/%d/weigh-in" % entry_id), {"noShow": True}, token=token)


def move(entry_id, kg, division_id, reason=None, token=ADMIN):
    return call("POST", base("/entries/%d/weigh-in/move" % entry_id),
                {"weightKg": kg, "divisionId": division_id, "reason": reason}, token=token)


def entry_row(entry_id):
    return sql("select Status, DivisionId, Category, ActualWeightKg, WeighInResult, StatusReason, "
               "CheckedInAt, MedicalResult, DeclaredWeightKg from TournamentEntries where Id=?", (entry_id,))[0]


def audits(entry_id, action):
    return sql("select FromStatus, ToStatus, Details from AuditLog "
               "where EntityType='tournament_entry' and EntityId=? and Action=? order by Id", (entry_id, action))


say("")
say("=== setup: one tournament, several categories and both genders ===")
T = tournament(["elite", "u18", "u16"], ["male", "female"], {
    "elite:male": [45, 48, 51, 63.5, None],
    "elite:female": [48, 75],
    "u18:male": [54],
    "u18:female": [45, 54],
    "u16:male": [40],
})
_, detail = call("GET", base("/%d" % T), token=ADMIN)
DIV = {(d["category"], d["gender"], d["weightLimitKg"]): d["id"] for d in detail["divisions"]}
check("the divisions are set up", len(DIV) == 11, sorted(DIV, key=str))


def admin_enter(rid, division_id):
    st, made = call("POST", base("/%d/entries" % T),
                    {"athleteRegistrationId": rid, "divisionId": division_id,
                     "declaredWeightKg": 50, "clubName": "Weigh Club"}, token=ADMIN)
    assert st == 200, made
    return made["id"]


AGE = {"elite": 25, "u18": 16, "u16": 14}


def enter(category, gender, limit, ready=True):
    rid, _, _ = athlete(AGE[category], gender)
    entry = admin_enter(rid, DIV[(category, gender, limit)])
    if ready:
        assert check_in(entry)[0] == 200
        assert medical(entry, "passed")[0] == 200
    return entry


def rng(entry_id):
    return row(entry_id)["division"]["weighInRange"]


def verdict(entry_id, kg):
    st, view = preview(entry_id, kg)
    assert st == 200, view
    return view["verdict"]


M48, M48B, M48C = enter("elite", "male", 48), enter("elite", "male", 48), enter("elite", "male", 48)
M51 = enter("elite", "male", 51)
M635 = enter("elite", "male", 63.5)
M45 = enter("elite", "male", 45)
MOPEN = enter("elite", "male", None)
F48 = enter("elite", "female", 48)
F75 = enter("elite", "female", 75)
U18F45 = enter("u18", "female", 45)
U18F54 = enter("u18", "female", 54)
U18M54 = enter("u18", "male", 54)
U16M40 = enter("u16", "male", 40)

D = lambda c, g, w: DIV[(c, g, w)]


def range_is(entry, kind, lo, hi, lower, inclusive, what):
    r = rng(entry)
    check("%s: %s, accepted %s" % (what, kind, r.get("label")),
          r["kind"] == kind and r["minKg"] == lo and r["maxKg"] == hi
          and r["lowerBoundKg"] == lower and r["lowerBoundInclusive"] == inclusive and r["resolved"] is True, r)


say("")
say("=== each division's range comes from its own official list ===")
range_is(M48, "bounded", 45.01, 48, 45, False, "Male Elite 48 kg")
range_is(M51, "bounded", 48.01, 51, 48, False, "Male Elite 51 kg")
range_is(M635, "bounded", 60.01, 63.5, 60, False,
         "Male Elite 63.5 kg (54, 57, 60 not run here: the official 60 kg is still the preceding class)")
range_is(F48, "bounded", 45.01, 48, 45, False, "Female Elite 48 kg (its 45 kg class is not run here)")
range_is(F75, "bounded", 71.01, 75, 71, False, "Female Elite 75 kg")
range_is(U18F45, "bounded", 42.01, 45, 42, False, "Female U18 45 kg (her list starts at 42)")
range_is(U18F54, "bounded", 51.01, 54, 51, False, "Female U18 54 kg")
range_is(U18M54, "bounded", 51.01, 54, 51, False, "Male U18 54 kg (51 kg not run here)")
range_is(U16M40, "bounded", 38.01, 40, 38, False, "Male U16 40 kg (first class 38 not run here)")
range_is(M45, "first", 43, 45, 43, True, "Male Elite 45 kg, the first class: 45 - 2 kg to 45 kg")
range_is(MOPEN, "open", 91.01, None, 91, False, "Male Elite +91 kg: above 91 kg, no maximum")
check("labels read as the Admin shows them",
      (rng(M48)["label"], rng(M45)["label"], rng(MOPEN)["label"]) == ("45.01–48 kg", "43–45 kg", "over 91 kg"),
      (rng(M48)["label"], rng(M45)["label"], rng(MOPEN)["label"]))
check("Female U18 45 kg and Male Elite 45 kg are different ranges (no leaking between lists)",
      rng(U18F45)["label"] == "42.01–45 kg" and rng(M45)["label"] == "43–45 kg")

say("")
say("=== real-time verdicts at every boundary (preview) ===")
for entry, cases in [
        (M48, [(45, "below_minimum"), (45.01, "matches"), (46, "matches"), (47.5, "matches"),
               (48, "matches"), (48.01, "exceeds_class"), (49, "exceeds_class")]),
        (M51, [(48, "below_minimum"), (48.01, "matches"), (51, "matches"), (51.01, "exceeds_class")]),
        (M635, [(60, "below_minimum"), (60.01, "matches"), (63.5, "matches"), (63.51, "exceeds_class")]),
        (U18F45, [(42, "below_minimum"), (42.01, "matches"), (45, "matches"), (45.01, "exceeds_class")]),
        (U16M40, [(38, "below_minimum"), (38.01, "matches"), (40, "matches"), (40.01, "exceeds_class")]),
        (M45, [(42.99, "below_minimum"), (43, "matches"), (44, "matches"), (45, "matches"), (45.01, "exceeds_class")]),
        (MOPEN, [(85, "below_minimum"), (91, "below_minimum"), (91.01, "matches"), (95, "matches"),
                 (110, "matches"), (299.99, "matches")])]:
    for kg, expected in cases:
        got = verdict(entry, kg)
        check("%s kg against %s: %s" % (kg, row(entry)["division"]["weightLabel"], expected), got == expected, got)
check("the open class never exceeds", all(verdict(MOPEN, kg) != "exceeds_class" for kg in (150, 250, 300)))

say("")
say("=== precision: at most two decimal places, refused (never rounded) above that ===")
for kg in ("48.001", "47.255", "45.0001"):
    st, body = preview(M48, kg)
    check("preview of %s kg is refused (400)" % kg, st == 400 and "two decimal places" in body.get("messageEn", ""), (st, body))
st, body = preview(M48, "47.250")
check("47.250 is two decimal places by value (accepted)", st == 200 and body["verdict"] == "matches", (st, body))
for kg in ("48.001", "33.255"):
    st, body = weigh(M48, kg, "passed")
    check("recording %s kg is refused (400), never rounded" % kg,
          st == 400 and kg in body.get("messageEn", ""), (st, body))
check("and nothing was recorded", entry_row(M48)[3] is None and entry_row(M48)[4] is None, entry_row(M48))
st, body = move(M48, "49.005", D("elite", "male", 51))
check("a weigh-in move with 49.005 kg is refused (400)", st == 400, (st, body))
check("and the class did not change", entry_row(M48)[1] == D("elite", "male", 48), entry_row(M48))

say("")
say("=== Passed: only on a match, stored exactly ===")
before = entry_row(M48)
for kg in (45, 48.01, 49, 44.99):
    status, body = weigh(M48, kg, "passed")
    check("Passed at %s kg in 48 kg is refused" % kg, status == 409, (status, body))
status, body = weigh(M48, 45, "passed")
check("the refusal names the exact weight and the range",
      "45 kg is outside" in body.get("messageEn", "") and "accepted 45.01–48 kg" in body.get("messageEn", ""), body)
check("nothing was recorded and the class did not change",
      entry_row(M48)[3] is None and entry_row(M48)[4] is None and entry_row(M48)[1] == before[1], entry_row(M48))
status, body = call("POST", base("/entries/%d/weigh-in" % M48),
                    {"weightKg": 49, "result": "passed", "noShow": False, "reason": None,
                     "matchesClass": True, "withinRegisteredClass": True, "minKg": 40, "maxKg": 50}, token=ADMIN)
check("a client claiming a match (and its own range) is ignored", status == 409, (status, body))
status, body = weigh(M48, "45.01", "passed")
check("Passed at 45.01 kg (previous limit + 0.01) is recorded", status == 200, body)
check("and stored exactly as 45.01", str(entry_row(M48)[3]) in ("45.01", "45.010") and entry_row(M48)[4] == "passed",
      entry_row(M48))
check("the audit line carries the exact weight", any("45.01 kg" in (a[2] or "") for a in audits(M48, "tournament.weigh_in_recorded")),
      audits(M48, "tournament.weigh_in_recorded"))
status, body = weigh(M48B, 47, "passed")
check("a whole number (47) is accepted", status == 200 and str(entry_row(M48B)[3]) in ("47", "47.0"), entry_row(M48B))
status, body = weigh(M48C, "47.5", "passed")
check("one decimal place (47.5) is accepted", status == 200 and str(entry_row(M48C)[3]) in ("47.5", "47.50"), entry_row(M48C))
status, body = weigh(M635, 60, "passed")
check("Passed at 60 kg in 63.5 kg is refused (60 is the preceding limit)", status == 409, status)
status, body = weigh(M635, "60.01", "passed")
check("Passed at 60.01 kg in 63.5 kg is recorded", status == 200, body)
status, body = weigh(U18F45, "42.01", "passed")
check("Passed at 42.01 kg in Female U18 45 kg is recorded", status == 200, body)

say("")
say("=== Failed: only outside the range, with a reason; no automatic class change ===")
status, body = weigh(M51, 50, "failed", reason="x")
check("Failed is refused for a weight inside the range", status == 409, body)
status, body = weigh(M51, "51.01", "failed")
check("Failed without a reason is refused", status == 400, body)
status, body = weigh(M51, "51.01", "failed", reason="Over the limit by 0.01 kg.")
check("Failed at 51.01 kg in 51 kg is recorded", status == 200, body)
r = entry_row(M51)
check("the athlete stays registered in 51 kg (no move)", r[1] == D("elite", "male", 51), r)
check("and is failed at the weigh-in, not qualified", r[0] == "not_eligible" and r[4] == "failed", r[:5])

say("")
say("=== the first class: recorded normally now ===")
status, body = weigh(M45, 43, "passed")
check("Passed at 43.00 kg (45 - 2) is recorded", status == 200, body)
M45B, M45C = enter("elite", "male", 45), enter("elite", "male", 45)
status, body = weigh(M45B, "42.99", "failed", reason="Under 43 kg.")
check("Failed at 42.99 kg (below minimum) is recorded", status == 200 and entry_row(M45B)[4] == "failed", body)
status, body = weigh(M45C, "45.01", "passed")
check("Passed at 45.01 kg is refused (exceeds)", status == 409, body)
status, body = weigh(M45C, "45.01", "failed", reason="Over 45 kg.")
check("Failed at 45.01 kg is recorded", status == 200, body)

say("")
say("=== the open class: recorded normally now ===")
status, body = weigh(MOPEN, "91.01", "passed")
check("Passed at 91.01 kg in +91 is recorded", status == 200, body)
MOPEN2, MOPEN3 = enter("elite", "male", None), enter("elite", "male", None)
status, body = weigh(MOPEN2, 91, "passed")
check("Passed at 91.00 kg in +91 is refused (not above 91)", status == 409, body)
status, body = weigh(MOPEN2, 91, "failed", reason="Not over 91 kg.")
check("Failed at 91.00 kg is recorded", status == 200, body)
status, body = weigh(MOPEN3, 150, "passed")
check("Passed at 150 kg in +91 is recorded (no maximum)", status == 200, body)

say("")
say("=== misconfigured divisions fail safe ===")
# Throwaway database only: a division whose stored preceding class disagrees with the official list.
sql("update TournamentDivisions set WeightFloorKg=45 where Id=?", (D("elite", "female", 75),))
r = rng(F75)
check("a division whose stored floor skips classes reads not configured",
      r["kind"] == "not_configured" and "official list" in r["issue"], r)
check("its weights are not judged", verdict(F75, 74) == "not_configured")
status, body = weigh(F75, 74, "passed")
check("and Passed is refused", status == 409 and "not configured" in body.get("messageEn", ""), body)
status, body = weigh(F75, 74, "failed", reason="x")
check("as is Failed", status == 409, body)
sql("update TournamentDivisions set WeightFloorKg=71 where Id=?", (D("elite", "female", 75),))
NODIV = enter("u18", "male", 54)
sql("update TournamentEntries set DivisionId=NULL where Id=?", (NODIV,))
nd = row(NODIV)
check("an entry with no division has no range to show", nd["division"] is None, nd["division"])
check("its preview reads not configured", verdict(NODIV, 54) == "not_configured")
status, body = weigh(NODIV, 54, "passed")
check("and Passed is refused", status == 409, body)

say("")
say("=== moving at the weigh-in: no gap between classes ===")
MV = enter("elite", "male", 48)
check("48.01 kg exceeds 48 kg", verdict(MV, "48.01") == "exceeds_class")
status, view = preview(MV, "48.01")
offered = {c["label"]: c["fits"] for c in view["classes"]}
check("the move list marks 51 kg as fitting 48.01 kg (no 0.01-0.49 gap any more), 63.5 kg as not",
      offered.get("51 kg") is True and offered.get("63.5 kg") is False and offered.get("48 kg") is False, offered)
status, view = preview(MV, "51.01")
check("51.01 kg fits no class this tournament runs (54-60 kg are not run here)",
      not any(c["fits"] for c in view["classes"]), view["classes"])
status, body = move(MV, "48.01", D("elite", "male", 51))
check("the desk moves the athlete to 51 kg", status == 200, body)
check("against 51 kg, 48.01 kg matches", verdict(MV, "48.01") == "matches")
status, body = weigh(MV, "48.01", "passed")
check("and Passed is accepted there", status == 200, body)
check("the move's audit carries the exact weight",
      any("48.01 kg" in (a[2] or "") for a in audits(MV, "tournament.entry_updated")), audits(MV, "tournament.entry_updated"))


# ─────────────────────────── Final Draw Approval and the draw ───────────────────────────
def approve_entry(entry_id, reason=None):
    return call("POST", base("/entries/%d/approve" % entry_id), {"reason": reason} if reason else None, token=ADMIN)


def reject_entry(entry_id, reason):
    return call("POST", base("/entries/%d/reject" % entry_id), {"reason": reason}, token=ADMIN)


def preparation(division_id):
    st, body = call("GET", base("/divisions/%d/draw-preparation" % division_id), token=ADMIN)
    assert st == 200, body
    return body


def pool(division_id):
    return sorted(a["entryId"] for a in preparation(division_id)["athletes"])


def overview_count(division_id):
    st, body = call("GET", base("/%d/draw-overview" % T), token=ADMIN)
    return next(d["approvedAthletes"] for d in body["divisions"] if d["id"] == division_id)


def ready(category, gender, limit, kg):
    entry = enter(category, gender, limit)
    st, body = weigh(entry, kg, "passed")
    assert st == 200, body
    st, body = approve_entry(entry)
    assert st == 200, body
    return entry


say("")
say("=== Final Draw Approval rests on a weigh-in that holds for the CURRENT class ===")
A1, A2 = ready("u18", "female", 54, 53), ready("u18", "female", 54, "51.01")
d54 = D("u18", "female", 54)
check("two approved athletes are in the U18 Female 54 kg pool", pool(d54) == sorted([A1, A2]), pool(d54))
check("and readiness says they are draw-eligible", row(A1)["drawEligible"] is True and row(A1)["staleWeighIn"] is None,
      (row(A1)["drawEligible"], row(A1)["staleWeighIn"]))
E1 = enter("u18", "female", 54)
weigh(E1, 53, "passed")
# Throwaway database only: a Passed whose weight no longer holds (as an old rule or an old class could leave).
sql("update TournamentEntries set ActualWeightKg='50' where Id=?", (E1,))
status, body = approve_entry(E1)
check("approving a Passed whose weight does not hold for the current class is refused",
      status == 409 and "does not hold" in body.get("messageEn", "") and "50 kg" in body.get("messageEn", ""), body)
check("and nothing was approved", sql("select QualifiedAt from TournamentEntries where Id=?", (E1,))[0][0] is None)

say("")
say("=== historical stale approvals are detected and kept out of the draw (records untouched) ===")
S1 = ready("u18", "female", 54, 54)
before_row = sql("select Status, QualifiedAt, WeighInResult, ActualWeightKg, DivisionId from TournamentEntries where Id=?", (S1,))[0]
# Throwaway database only: what entries #17/#20/#21 look like - approved, then moved to another class by the old code.
sql("update TournamentEntries set DivisionId=? where Id=?", (D("u18", "female", 45), S1))
d45 = D("u18", "female", 45)
r = row(S1)
check("readiness flags the stale weigh-in", r["drawEligible"] is False and "does not match" in (r["staleWeighIn"] or ""),
      (r["drawEligible"], r["staleWeighIn"]))
check("its state is still 'qualified' - nothing was changed on the record", r["state"] == "qualified", r["state"])
check("the stale athlete is not in the 45 kg pool", S1 not in pool(d45), pool(d45))
check("nor counted on the overview", overview_count(d45) == len(pool(d45)), (overview_count(d45), pool(d45)))
after_row = sql("select Status, QualifiedAt, WeighInResult, ActualWeightKg from TournamentEntries where Id=?", (S1,))[0]
check("reading it changed nothing", after_row == before_row[:4], (before_row, after_row))
st, ent = call("GET", base("/%d/entries" % T), token=ADMIN)
e_s1 = next(e for e in ent if e["id"] == S1)
check("the entries list reports it too", "does not match" in (e_s1.get("staleWeighIn") or ""), e_s1.get("staleWeighIn"))
status, body = reject_entry(S1, "Weigh-in was for another class.")
check("an approval that no longer holds can still be withdrawn (Reject)", status == 200, body)

say("")
say("=== a Draft made before an approval went stale is flagged, never changed ===")
st, gen = call("POST", base("/divisions/%d/draw/generate" % d54), {"expectedEntryIds": pool(d54)}, token=ADMIN)
check("a Draft is generated for the two eligible athletes", st == 200, (st, gen))
bouts_before = sql("select Id, RedEntryId, BlueEntryId from Bouts where DivisionId=? order by Id", (d54,))
# Throwaway database only: A2's recorded weight no longer holds for 54 kg.
sql("update TournamentEntries set ActualWeightKg='51' where Id=?", (A2,))
prep = preparation(d54)
sync = prep.get("sync") or {}
removed = {a["entryId"]: a["reason"] for a in sync.get("removed", [])}
check("Draw Preparation reports the Draft as changed", sync.get("changed") is True, sync)
check("naming the athlete and why", A2 in removed and "weigh-in no longer valid" in removed[A2], removed)
check("the Draft itself is untouched",
      sql("select Id, RedEntryId, BlueEntryId from Bouts where DivisionId=? order by Id", (d54,)) == bouts_before)
st, body = call("POST", base("/divisions/%d/draw/generate" % D("u18", "male", 54)),
                {"expectedEntryIds": [], "dryRun": True}, token=ADMIN)
check("a dry run on a division with no eligible athlete is refused", st in (400, 409), (st, body))

say("")
say("=== class and category changes after a weigh-in and approval ===")
C1 = ready("elite", "male", 48, 47)
st, plist = call("GET", base("/%d/participants" % T), token=ADMIN)
p1 = next(p for p in plist["participants"] if p["id"] == C1) if isinstance(plist, dict) else next(p for p in plist if p["id"] == C1)
check("the Participants page is told a change would clear readiness", p1.get("classChangeClearsReadiness") is True, p1.get("classChangeClearsReadiness"))
status, body = call("PUT", base("/entries/%d/category" % C1), {"category": "elite", "divisionId": D("elite", "male", 51)}, token=ADMIN)
check("a Participants class change without a reason is refused", status == 400 and "reason" in body.get("messageEn", ""), body)
check("and nothing changed", entry_row(C1)[1] == D("elite", "male", 48) and entry_row(C1)[4] == "passed", entry_row(C1))
status, body = call("PUT", base("/entries/%d/category" % C1),
                    {"category": "elite", "divisionId": D("elite", "male", 51), "reason": "Registered in the wrong class."}, token=ADMIN)
check("with a reason it is made", status == 200, body)
r = sql("select Status, DivisionId, WeighInResult, ActualWeightKg, QualifiedAt, WeighInAt from TournamentEntries where Id=?", (C1,))[0]
check("the weigh-in result and approval are cleared; the measured weight is kept",
      r[0] == "checked_in" and r[1] == D("elite", "male", 51) and r[2] is None and float(r[3]) == 47 and r[4] is None and r[5] is None, r)
last = audits(C1, "tournament.entry_updated")[-1][2]
check("the change's audit line says what was cleared and why",
      "Cleared for the new class" in last and "weigh-in passed (47 kg" in last and "Final Draw Approval" in last
      and "Registered in the wrong class." in last, last)
check("the athlete is not draw-eligible until weighed again", row(C1)["drawEligible"] is False and C1 not in pool(D("elite", "male", 51)))
status, body = weigh(C1, 47, "passed")
check("47 kg is below 51 kg's range, so Passed is refused there", status == 409, body)

C2 = enter("elite", "male", 48)
status, body = call("PUT", base("/entries/%d/category" % C2), {"category": "elite", "divisionId": D("elite", "male", 51)}, token=ADMIN)
check("before any weigh-in, a class change still needs a reason (every move does)", status == 400, body)
status, body = call("PUT", base("/entries/%d/category" % C2), {"category": "elite", "divisionId": D("elite", "male", 51), "reason": "Wrong class."}, token=ADMIN)
check("with one it is made", status == 200, body)

C3 = enter("elite", "male", 48)
weigh(C3, 49, "failed", reason="Over 48 kg.")
status, body = call("PUT", base("/entries/%d/category" % C3), {"category": "elite", "divisionId": D("elite", "male", 51)}, token=ADMIN)
check("after a Failed weigh-in a class change needs a reason", status == 400, body)
status, body = call("PUT", base("/entries/%d/category" % C3),
                    {"category": "elite", "divisionId": D("elite", "male", 51), "reason": "Moving up to 51 kg."}, token=ADMIN)
r = entry_row(C3)
check("with one, the Failed is cleared and the athlete is no longer Not Eligible",
      status == 200 and r[4] is None and r[0] == "checked_in" and float(r[3]) == 49, (status, r))
status, body = weigh(C3, 49, "passed")
check("and 49 kg can now be passed in 51 kg", status == 200, body)

C4 = enter("elite", "male", 48, ready=False)  # No Show is recorded at check-in, for an athlete who never arrived
status, body = no_show(C4)
check("(a No Show is recorded at check-in)", status == 200 and entry_row(C4)[4] == "no_show", (status, body))
status, body = call("PUT", base("/entries/%d/category" % C4), {"category": "elite", "divisionId": D("elite", "male", 51), "reason": "Wrong class."}, token=ADMIN)
check("a No Show is not a class judgement: the change keeps the DSQ",
      status == 200 and entry_row(C4)[0] == "disqualified" and entry_row(C4)[4] == "no_show", (status, entry_row(C4)))

C5 = ready("elite", "male", 48, 46)
status, body = call("PUT", base("/entries/%d" % C5), {"divisionId": D("elite", "male", 51)}, token=ADMIN)
check("the technical amendment is held to the same rule (no reason: refused)", status == 400, body)
status, body = call("PUT", base("/entries/%d" % C5), {"divisionId": D("elite", "male", 51), "reason": "Technical move."}, token=ADMIN)
r = sql("select DivisionId, WeighInResult, QualifiedAt, Status from TournamentEntries where Id=?", (C5,))[0]
check("with a reason: moved, weigh-in and approval cleared",
      status == 200 and r[0] == D("elite", "male", 51) and r[1] is None and r[2] is None and r[3] == "checked_in", (status, r))

say("")
say("=== a change out of a Draft is flagged on the Draft, which is not touched ===")
status, body = call("PUT", base("/entries/%d/category" % A1),
                    {"category": "u18", "divisionId": D("u18", "female", 45), "reason": "Wrong class at entry."}, token=ADMIN)
check("an athlete in a Draft can be moved, with a reason", status == 200, body)
last = audits(A1, "tournament.entry_updated")[-1][2]
check("the audit line says the previous division's draft includes the athlete", "previous division's draw includes the athlete" in last, last)
removed = {a["entryId"]: a["reason"] for a in preparation(d54)["sync"]["removed"]}
check("and Draw Preparation lists them as no longer eligible", A1 in removed, removed)
check("the Draft's bouts are unchanged",
      sql("select Id, RedEntryId, BlueEntryId from Bouts where DivisionId=? order by Id", (d54,)) == bouts_before)

say("")
say("=== published draws are never changed from here ===")
P1 = ready("u18", "male", 54, 53)
P2 = ready("u18", "male", 54, 52)
dm54 = D("u18", "male", 54)
st, gen = call("POST", base("/divisions/%d/draw/generate" % dm54), {"expectedEntryIds": pool(dm54)}, token=ADMIN)
# Throwaway database only: mark it published without running the publication workflow.
sql("update TournamentDivisions set DrawPublishedAt=CURRENT_TIMESTAMP where Id=?", (dm54,))
status, body = call("PUT", base("/entries/%d/category" % P1), {"category": "u18", "divisionId": dm54, "reason": "x"}, token=ADMIN)
status, body = call("PUT", base("/entries/%d" % P1), {"divisionId": D("u18", "male", 54), "reason": "x"}, token=ADMIN)
check("amending to the same division is a no-op", status == 200, body)
other = [k for k in DIV if k[0] == "u18" and k[1] == "male" and k[2] != 54]
check("(the tournament runs only 54 kg for U18 men, so a move elsewhere goes to another category)", other == [], other)
status, body = call("PUT", base("/entries/%d" % P1), {"divisionId": D("u18", "female", 54), "reason": "x"}, token=ADMIN)
check("the technical amendment refuses to move an athlete out of a published draw (new check)",
      status == 409 and "published" in body.get("messageEn", ""), body)
check("the athlete is where they were", entry_row(P1)[1] == dm54 and entry_row(P1)[4] == "passed", entry_row(P1))

say("")
print("%d failure(s)" % len(failures))
for name in failures:
    print("  - " + name)
sys.exit(1 if failures else 0)
