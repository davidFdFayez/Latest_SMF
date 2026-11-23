"""
Check-in & Medical Examination — REQ-08 and REQ-09 as the admin page drives them.

Step order, check-in recorded once, examination corrections (reason required,
Failed undone back to checked in), the weigh-in against the official class
range (above the preceding official limit up to the limit, never above — SMTF weigh-in policy of
2026-11-14), a move restricted to the athlete's own category
and gender (entry only, weight kept, audited), No Show as DSQ / T05 and its
correction, locks after approval or a published draw, and who may do what.
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


def upload(path, token, name="certificate.png"):
    """A small PNG, sent as a multipart form the way a browser would."""
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082")
    boundary = "----smf" + uuid.uuid4().hex
    body = (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\n"
             "Content-Type: image/png\r\n\r\n" % (boundary, name)).encode() + png
            + ("\r\n--%s--\r\n" % boundary).encode())
    head = {"Content-Type": "multipart/form-data; boundary=" + boundary}
    if token:
        head["Authorization"] = "Bearer " + token
    request = urllib.request.Request(API + path, data=body, method="POST", headers=head)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


def upload_dated(path, token, date=None):
    """A medical document that needs its date, as the desk sends it."""
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082")
    boundary = "----smf" + uuid.uuid4().hex
    day = (date or (TODAY - datetime.timedelta(days=3))).isoformat()
    body = (("--%s\r\nContent-Disposition: form-data; name=\"date\"\r\n\r\n%s\r\n" % (boundary, day)).encode()
            + ("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"cert.png\"\r\n"
               "Content-Type: image/png\r\n\r\n" % boundary).encode() + png
            + ("\r\n--%s--\r\n" % boundary).encode())
    head = {"Content-Type": "multipart/form-data; boundary=" + boundary, "Authorization": "Bearer " + token}
    request = urllib.request.Request(API + path, data=body, method="POST", headers=head)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


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

def account_with(permissions):
    tag = uuid.uuid4().hex[:8]
    st, role = call("POST", "/api/admin/roles",
                    {"key": "p_" + tag, "nameAr": "دور " + tag, "nameEn": "Role " + tag,
                     "permissions": permissions}, token=ADMIN)
    assert st in (200, 201), role
    st, user = call("POST", "/api/admin/users",
                    {"username": "p" + tag, "displayName": "User " + tag, "password": "Tourn@ment2026x",
                     "isActive": True, "roleIds": [role["id"]]}, token=ADMIN)
    assert st in (200, 201), user
    st, login = call("POST", "/api/auth/login", {"username": "p" + tag, "password": "Tourn@ment2026x"})
    assert st == 200, login
    return login["token"]



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


def in_bracket(entry_id):
    """Seats the entry in a bout of its division, as a published draw would (the lock applies to bracket entries)."""
    sql("insert into Bouts (TournamentId, DivisionId, Round, Position, RedEntryId, IsBye, IsWalkover, RingPinned, CreatedAt) "
        "select TournamentId, DivisionId, 1, 900 + Id, Id, 0, 0, 0, datetime('now') from TournamentEntries where Id=?", (entry_id,))
    return sql("select max(Id) from Bouts")[0][0]


def out_of_bracket(bout_id):
    sql("delete from Bouts where Id=?", (bout_id,))


def audits(entry_id, action):
    return sql("select FromStatus, ToStatus, Details from AuditLog "
               "where EntityType='tournament_entry' and EntityId=? and Action=? order by Id", (entry_id, action))


say("")
say("=== setup ===")
T = tournament(["u18", "u24"], ["male", "female"],
               {"u18:male": [48, 51, 54], "u18:female": [45, 48], "u24:male": [54, 57]})
_, detail = call("GET", base("/%d" % T), token=ADMIN)
DIV = {(d["category"], d["gender"], d["weightLimitKg"]): d["id"] for d in detail["divisions"]}
U18M = {k[2]: v for k, v in DIV.items() if k[0] == "u18" and k[1] == "male"}
U18F51 = None


def admin_enter(rid, division_id):
    st, made = call("POST", base("/%d/entries" % T),
                    {"athleteRegistrationId": rid, "divisionId": division_id,
                     "declaredWeightKg": 50, "clubName": "Readiness Club"}, token=ADMIN)
    assert st == 200, made
    return made["id"]


ids = {}
for key, gender, limit in [("a", "male", 51), ("b", "male", 51), ("c", "male", 51),
                           ("d", "male", 48), ("e", "male", 54), ("f", "female", 45)]:
    rid, _, _ = athlete(16, gender)
    ids[key] = admin_enter(rid, DIV[("u18", gender, limit)])
A, B, C, D, E, F = (ids[k] for k in "abcdef")
check("six entries", len(ids) == 6, ids)

status, listing = readiness()
check("the readiness list opens", status == 200, listing if status != 200 else "")
order = [x["division"]["gender"] for x in listing["athletes"]]
check("Female divisions come first", order[0] == "female" and order[-1] == "male", order)
weights = [x["division"]["weightLimitKg"] for x in listing["athletes"] if x["division"]["gender"] == "male"]
check("then weights lightest first", weights == sorted(weights), weights)
first = row(A)
check("a fresh entry is on step 1 with nothing done",
      first["state"] == "checkin" and first["step"] == 1 and first["stepsDone"] == 0, first["state"])
check("and carries the applicable requirements", len(first["requirements"]) >= 2, first["requirements"])

say("")
say("=== REQ-08: check-in, once ===")
status, _ = medical(A, "passed", "x")
check("the examination is refused before check-in", status == 409, status)
status, _ = check_in(A)
check("check-in is recorded", status == 200, status)
at = entry_row(A)[6]
status, body = check_in(A)
check("a second check-in is refused", status == 409, body)
check("and the original time is kept", entry_row(A)[6] == at, entry_row(A)[6])
r = row(A)
check("the athlete moves on to step 2",
      r["state"] == "medical" and r["step"] == 2 and r["stepsDone"] == 1 and r["checkIn"]["by"] == "admin", r)

say("")
say("=== REQ-08: the examination and its correction ===")
status, _ = medical(A, "passed", None, missing=True)
check("Passed with documents missing and no notes is recorded", status == 200, status)
check("and the athlete is on step 3", row(A)["state"] == "weighin" and row(A)["stepsDone"] == 2, row(A)["state"])
check("the document statuses are unchanged by it",
      all(r["status"] == "missing" for r in row(A)["requirements"]), row(A)["requirements"])
status, body = medical(A, "failed", None, correction="Doctor re-examined.")
check("Passed -> Failed needs the reason for the failure", status == 400, body)
status, body = medical(A, "failed", "x" * 501)
check("a reason over 500 characters is refused", status == 400, body)
status, _ = medical(A, "failed", "Unfit.")
check("Passed -> Failed with only the failure reason is accepted (one reason per action)", status == 200, status)
check("Failed makes the entry not eligible", entry_row(A)[0] == "not_eligible", entry_row(A)[0])
check("and the list shows Failed on step 2", row(A)["state"] == "failed" and row(A)["step"] == 2, row(A)["state"])
status, _ = weigh(A, 50, "passed")
check("a Failed athlete cannot go on to the weigh-in", status == 409, status)
status, _ = medical(A, "failed", "Unfit: blood pressure.")
check("a new failure reason needs only the failure reason", status == 200 and row(A)["medical"]["note"] == "Unfit: blood pressure.",
      row(A)["medical"])
status, _ = medical(A, "passed", "Cleared on appeal.")
check("Failed -> Passed without a correction reason is refused", status == 400, status)
status, _ = medical(A, "passed", None, correction="Wrong athlete examined.")
check("Failed -> Passed with only the correction reason is accepted", status == 200, status)
check("and the failure reason does not survive into the pass", row(A)["medical"]["note"] is None, row(A)["medical"])
check("and returns the entry to checked in", entry_row(A)[0] == "checked_in" and entry_row(A)[5] is None,
      entry_row(A)[:6])
trail = audits(A, "tournament.medical_recorded")
check("each correction is audited from -> to with its reason",
      trail[-1][0] == "failed" and trail[-1][1] == "passed" and "Wrong athlete examined." in trail[-1][2], trail[-1])
check("the failure reason is the audit explanation of Passed -> Failed",
      trail[-3][0] == "passed" and trail[-3][1] == "failed" and "Reason for failure: Unfit." in trail[-3][2], trail[-3])

first_fail = athlete(16)[0]
FF = admin_enter(first_fail, U18M[51])
check_in(FF)
status, body = medical(FF, "failed", None)
check("an initial Failed without a reason for the failure is refused", status == 400, body)
status, body = medical(FF, "failed", "   ")
check("a blank reason is refused too", status == 400, body)
status, _ = medical(FF, "failed", "Injured hand.")
check("with a reason it is recorded", status == 200, status)
r = row(FF)
check("the list reads Failed with the reason kept",
      r["state"] == "failed" and r["medical"]["note"] == "Injured hand." and r["medical"]["by"] == "admin", r["medical"])

say("")
say("=== REQ-09: the accepted range — above the preceding official limit, up to the limit, never above ===")
# U18 male 51 kg follows 48 kg: accepted 48 < w <= 51.0 (48.01–51 at two decimals). No tolerance above the limit.
for kg, verdict in [("51", "matches"), ("51.01", "exceeds_class"), ("51.5", "exceeds_class"),
                    ("52", "exceeds_class"), ("48.5", "matches"), ("48.51", "matches"),
                    ("48.49", "matches"), ("48.2", "matches"), ("48.01", "matches"), ("48", "below_minimum"),
                    ("47.5", "below_minimum"), ("49.75", "matches")]:
    status, view = preview(A, kg)
    check("%s kg against the 51 kg class (48 < w <= 51.0): %s" % (kg, verdict),
          view["verdict"] == verdict and view["withinRegisteredClass"] is (verdict == "matches"),
          (view["verdict"], view["withinRegisteredClass"]))
check("the preview carries the range it judged on",
      view["range"]["minKg"] == 48.01 and view["range"]["lowerBoundKg"] == 48 and view["range"]["lowerBoundInclusive"] is False
      and view["range"]["maxKg"] == 51 and view["range"]["kind"] == "bounded" and view["range"]["label"] == "48.01–51 kg",
      view["range"])
status, _ = weigh(A, 51.5, "passed")
check("51.5 kg — once inside the old +0.5 tolerance — is refused as Passed", status == 409, status)
status, view = preview(A, 52)
labels = [c["label"] for c in view["classes"]]
check("only the athlete's own category and gender are offered", labels == ["48 kg", "51 kg", "54 kg"], labels)
check("the current class is marked", [c["current"] for c in view["classes"]] == [False, True, False])
check("and 52 kg fits only 54 kg", [c["fits"] for c in view["classes"]] == [False, False, True])

for bad in (0, -1, 301):
    status, _ = weigh(A, bad, "failed")
    check("a weight of %s is refused" % bad, status == 400, status)

say("")
say("=== REQ-09: mismatch — Passed is not available, the class can be moved ===")
status, _ = weigh(A, 52, "passed")
check("Passed outside the registered class is refused", status == 409, status)
check("and nothing was recorded", entry_row(A)[4] is None and entry_row(A)[3] is None, entry_row(A))
status, _ = move(A, 52, DIV[("u24", "male", 54)])
check("a move to another category is refused", status == 409, status)
status, _ = move(A, 52, DIV[("u18", "female", 48)])
check("a move to the other gender is refused", status == 409, status)
status, _ = move(A, 52, U18M[51])
check("a move to the class they are in is refused", status == 400, status)
declared = entry_row(A)[8]
status, body = move(A, 52, U18M[54])
check("a move to 54 kg of their own category is made", status == 200, body)
now = entry_row(A)
check("the entry's class changes, category stays U18", now[1] == U18M[54] and now[2] == "u18", now)
check("the actual weight is kept, no result yet", float(now[3]) == 52 and now[4] is None, now)
check("the declared weight is untouched", now[8] == declared, now[8])
moved = audits(A, "tournament.entry_updated")
check("the move is audited with the previous and new classes",
      moved and moved[-1][0] == "U18 / 51 kg" and moved[-1][1] == "U18 / 54 kg" and "52 kg" in moved[-1][2], moved)
status, view = preview(A, 52)
check("against the new class the weight now matches", view["withinRegisteredClass"] is True, view)
status, _ = weigh(A, 52, "passed")
check("so Passed is now accepted", status == 200, status)
r = row(A)
check("the list keeps the match result and the move history",
      row(A)["weighIn"]["withinClass"] is True and row(A)["weighIn"]["verdict"] == "matches"
      and [(m["from"], m["to"]) for m in row(A)["weighIn"]["moves"]] == [("U18 / 51 kg", "U18 / 54 kg")],
      row(A)["weighIn"])
check("all three steps are done: ready, awaiting approval",
      r["state"] == "ready" and r["stepsDone"] == 3 and r["weighIn"]["result"] == "passed", r["state"])
status, _ = weigh(A, 53, "passed")
check("re-recording the weigh-in without a reason is refused", status == 400, status)
status, _ = move(A, 52, U18M[48])
check("moving after a result needs a reason too", status == 400, status)

say("")
say("=== approval locks the record ===")
status, body = call("POST", base("/entries/%d/approve" % A), token=ADMIN)
check("the director's approval qualifies them", status == 200 and body["status"] == "qualified", body)
check("the list reads approved and locked", row(A)["state"] == "qualified" and row(A)["locked"] is True)
status, _ = medical(A, "failed", "x", correction="late")
check("the examination can no longer be changed", status == 409, status)
status, _ = weigh(A, 52, "failed", reason="late")
check("nor the weigh-in", status == 409, status)
status, _ = no_show(A)
check("nor a No Show recorded", status == 409, status)

say("")
say("=== REQ-09 rule 6: No Show is recorded at check-in only; older weigh-in No Shows stay ===")
check_in(B)
medical(B, "passed", "ok")
status, body = no_show(B)
check("a No Show for an athlete who has checked in is refused", status == 409 and "Check-in only" in body["messageEn"], body)
check("and nothing changed", entry_row(B)[0] == "checked_in" and entry_row(B)[4] is None, entry_row(B))
# A weigh-in No Show recorded before the rule, as such a record stands in the database.
sql("update TournamentEntries set Status='disqualified', WeighInResult='no_show', WeighInAt=datetime('now'), "
    "WeighInBy='admin', StatusReason='T05 — No show at the weigh-in (DSQ).' where Id=?", (B,))
st = entry_row(B)
check("as its own result, not Failed", st[4] == "no_show", st[4])
check("with the T05 code in the reason", st[5] and st[5].startswith("T05"), st[5])
check("the historical record still reads DSQ on step 3", row(B)["state"] == "dsq" and row(B)["step"] == 3, row(B)["state"])
status, _ = no_show(B)
check("a second No Show is refused", status == 409, status)
status, _ = weigh(B, 50, "passed")
check("undoing it needs a correction reason", status == 400, status)
status, _ = weigh(B, 50, "passed", reason="Athlete was at the scales; wrong row.")
check("with one the weigh-in is recorded", status == 200, status)
check("the weigh-in audit keeps the No Show it replaced",
      "Replaces No Show (DSQ, T05)" in audits(B, "tournament.weigh_in_recorded")[-1][2])
check("and the disqualification is lifted",
      entry_row(B)[0] == "checked_in" and entry_row(B)[5] is None and row(B)["state"] == "ready", entry_row(B))

say("")
say("=== REQ-09 rule 5: Failed at the weigh-in ===")
check_in(C)
medical(C, "passed", "ok")
status, _ = weigh(C, 55, "failed")
check("a weigh-in Failed needs its reason", status == 400, status)
status, _ = weigh(C, 50, "failed", reason="x")
check("Failed is refused for a weight that makes the class", status == 409, status)
check("and nothing was recorded", entry_row(C)[4] is None, entry_row(C))
status, _ = weigh(C, 55, "failed", reason="Over by 4 kg.")
check("Failed is recorded with the weight", status == 200 and float(entry_row(C)[3]) == 55, status)
check("the entry is not eligible, with the reason", entry_row(C)[0] == "not_eligible" and entry_row(C)[5] == "Over by 4 kg.",
      entry_row(C))
check("the list shows Failed on step 3", row(C)["state"] == "failed" and row(C)["step"] == 3)
status, _ = call("POST", base("/entries/%d/approve" % C), token=ADMIN)
check("and cannot be approved for the draw", status == 409, status)

say("")
say("=== a published draw locks readiness and closes its class to moves ===")
check_in(D)
check_in(E)
medical(E, "passed", "ok")
LATE = admin_enter(athlete(16)[0], U18M[48])
D_BOUT = in_bracket(D)
sql("update TournamentDivisions set DrawPublishedAt=datetime('now') where Id=?", (U18M[48],))
status, _ = medical(D, "passed", "ok")
check("an entry in the published bracket cannot be examined here", status == 409, status)
status, _ = check_in(LATE)
check("an entry that joined after publication (not in the bracket) completes readiness normally", status == 200, status)
status, view = preview(E, 47)
check("a published class with no bout started is offered (the athlete would join as a late entrant)",
      any(c["label"] == "48 kg" for c in view["classes"]), view["classes"])
sql("update Bouts set WinnerEntryId=RedEntryId where Id=?", (D_BOUT,))
status, view = preview(E, 47)
check("a class where a bout has started is not offered", all(c["label"] != "48 kg" for c in view["classes"]), view["classes"])
status, _ = move(E, 47, U18M[48])
check("and a move into it is refused", status == 409, status)
sql("update Bouts set WinnerEntryId=NULL where Id=?", (D_BOUT,))
sql("update TournamentDivisions set DrawPublishedAt=NULL where Id=?", (U18M[48],))
out_of_bracket(D_BOUT)

say("")
say("=== No Show at check-in: DSQ / T05 from step 1, and its correction ===")
G = admin_enter(athlete(16)[0], U18M[51])
status, body = no_show(G)
check("a No Show can be recorded before check-in", status == 200 and body["status"] == "disqualified", body)
st = entry_row(G)
check("it is a DSQ with the T05 check-in reason", st[0] == "disqualified" and st[5] == "T05 — No show at check-in (DSQ).", st)
check("as a No Show, not a Failed", st[4] == "no_show", st[4])
r = row(G)
check("the list reads DSQ on step 1", r["state"] == "dsq" and r["step"] == 1 and r["stepsDone"] == 0, r)
check("recorded with who and when", r["weighIn"]["by"] == "admin" and r["weighIn"]["at"], r["weighIn"])
check("the audit line says where", "check-in" in audits(G, "tournament.weigh_in_recorded")[-1][2])
status, _ = medical(G, "passed")
check("they cannot go on to the examination", status == 409, status)
status, _ = weigh(G, 50, "passed", reason="x")
check("nor to the weigh-in", status == 409, status)
status, _ = check_in(G)
check("correcting it without a reason is refused", status == 400, status)
status, _ = call("POST", base("/entries/%d/check-in" % G), {"reason": "   "}, token=ADMIN)
check("a blank reason too", status == 400, status)
check("and the DSQ stands", entry_row(G)[0] == "disqualified")
status, body = call("POST", base("/entries/%d/check-in" % G), {"reason": "Athlete was at the desk; wrong row."}, token=ADMIN)
check("with a reason the athlete is checked in after all", status == 200 and body["status"] == "checked_in", body)
st = entry_row(G)
check("the DSQ is lifted", st[0] == "checked_in" and st[4] is None and st[5] is None and st[6], st)
check("and they are on step 2", row(G)["state"] == "medical", row(G)["state"])
line = audits(G, "tournament.checked_in")[-1]
check("the audit keeps the DSQ it replaced and the reason",
      line[0] == "disqualified" and line[1] == "checked_in"
      and "Athlete was at the desk; wrong row." in line[2] and "Replaces No Show (DSQ, T05)" in line[2], line)
status, _ = check_in(G)
check("a second check-in is still refused", status == 409, status)
status, _ = no_show(G)
check("and once checked in, a No Show can no longer be recorded", status == 409 and entry_row(G)[0] == "checked_in", entry_row(G)[0])

H = admin_enter(athlete(16)[0], U18M[48])
no_show(H)
H_BOUT = in_bracket(H)
sql("update TournamentDivisions set DrawPublishedAt=datetime('now') where Id=?", (U18M[48],))
status, _ = call("POST", base("/entries/%d/check-in" % H), {"reason": "Mistake."}, token=ADMIN)
check("once the draw is published the No Show cannot be corrected", status == 409, status)
check("and stays a DSQ", entry_row(H)[0] == "disqualified")
sql("update TournamentDivisions set DrawPublishedAt=NULL where Id=?", (U18M[48],))
out_of_bracket(H_BOUT)
check("the technical team permission is still required",
      call("POST", base("/entries/%d/check-in" % H), {"reason": "x"}, token=account_with(["tournament.entries"]))[0] == 403)

say("")
say("=== the move list is the tournament's configuration, not the official table ===")
check_in(D)
medical(D, "passed")
status, view = preview(D, 50)
check("before: 48 (current), 51 and 54 are offered",
      [c["label"] for c in view["classes"]] == ["48 kg", "51 kg", "54 kg"], [c["label"] for c in view["classes"]])
config = sql("select WeightClassesJson from Tournaments where Id=?", (T,))[0][0]
# 54 kg stays as a division (an athlete is in it) but is no longer configured.
sql("update Tournaments set WeightClassesJson=? where Id=?",
    ('{"u18:male":[48,51],"u18:female":[45,48],"u24:male":[54,57]}', T))
status, view = preview(D, 50)
check("after: a division the tournament no longer runs is not offered",
      [c["label"] for c in view["classes"]] == ["48 kg", "51 kg"], [c["label"] for c in view["classes"]])
status, _ = move(D, 53, U18M[54])
check("and a move into it is refused", status == 409, status)
sql("update Tournaments set WeightClassesJson=? where Id=?", (config, T))

say("")
say("=== who may do what ===")
ENTRIES = account_with(["tournament.entries"])
DIRECTOR = account_with(["tournament.director"])
TECH = account_with(["tournament.technical"])
check("entries-only cannot open the readiness list", readiness(ENTRIES)[0] == 403)
check("entries-only cannot check in", check_in(F, ENTRIES)[0] == 403)
check("entries-only cannot move a class", move(E, 50, U18M[51], token=ENTRIES)[0] == 403)
check("the director can open the list", readiness(DIRECTOR)[0] == 200)
check("and the tournament selector", call("GET", "/api/admin/tournaments", token=DIRECTOR)[0] == 200)
check("but cannot record a step", check_in(F, DIRECTOR)[0] == 403)
check("the technical team can open the list", readiness(TECH)[0] == 200)
check("and records the steps", check_in(F, TECH)[0] == 200)
check("but cannot approve for the draw",
      call("POST", base("/entries/%d/approve" % B), token=TECH)[0] == 403)

say("")
say("=== the approver's decision, and changing it ===")
check("B is ready, awaiting approval", row(B)["state"] == "ready", row(B)["state"])
reject = lambda entry_id, reason, token: call("POST", base("/entries/%d/reject" % entry_id), {"reason": reason}, token=token)
approve_entry = lambda entry_id, token, reason=None: call("POST", base("/entries/%d/approve" % entry_id),
                                                    {"reason": reason} if reason is not None else None, token=token)
check("the technical team cannot reject", reject(B, "No.", TECH)[0] == 403)
check("entries-only cannot reject", reject(B, "No.", ENTRIES)[0] == 403)
status, _ = reject(B, "  ", DIRECTOR)
check("a reason for rejection is required", status == 400, status)
status, _ = reject(B, "x" * 501, DIRECTOR)
check("and is kept to 500 characters", status == 400, status)
check("nothing was saved by the refused attempts", entry_row(B)[0] == "checked_in", entry_row(B)[0])
status, body = reject(B, "Coach licence not presented.", DIRECTOR)
check("the director rejects with a reason", status == 200 and body["status"] == "rejected", body)
r = row(B)
check("the list reads Rejected, locked, with who, when and why",
      r["state"] == "rejected" and r["locked"] and r["rejected"]["by"].startswith("p")
      and r["rejected"]["reason"] == "Coach licence not presented." and r["rejected"]["at"], r.get("rejected"))
check("the rejection is audited",
      audits(B, "tournament.readiness_rejected")[-1][2] == "Reason for rejection: Coach licence not presented.")
status, _ = reject(B, "Again.", DIRECTOR)
check("a second rejection is refused", status == 409, status)
status, _ = medical(B, "failed", "x")
check("a rejected athlete's readiness cannot be changed underneath", status == 409, status)
status, _ = no_show(B)
check("nor be marked No Show", status == 409, status)
check("and is not counted as qualified", sql("select QualifiedAt from TournamentEntries where Id=?", (B,))[0][0] is None)

status, _ = approve_entry(B, DIRECTOR)
check("Rejected -> Approved without a correction reason is refused", status == 400, status)
check("the technical team cannot change the decision", approve_entry(B, TECH, "x")[0] == 403)
status, body = approve_entry(B, DIRECTOR, "Licence produced the same day.")
check("Rejected -> Approved with a correction reason", status == 200 and body["status"] == "qualified", body)
st = sql("select Status, QualifiedAt, ReadinessRejectedAt, ReadinessRejectionReason from TournamentEntries where Id=?", (B,))[0]
check("the entry is qualified and the rejection cleared from it", st[0] == "qualified" and st[1] and st[2] is None and st[3] is None, st)
line = audits(B, "tournament.readiness_approved")[-1]
check("the audit keeps the old decision, the new one and both reasons",
      line[0] == "rejected" and line[1] == "qualified" and "Licence produced the same day." in line[2]
      and "Coach licence not presented." in line[2], line)
check("the list reads Approved", row(B)["state"] == "qualified")

status, body = reject(B, "Licence found to be forged.", DIRECTOR)
check("Approved -> Rejected with the rejection reason alone", status == 200 and body["status"] == "rejected", body)
check("not in a draw, so nothing to redraw", body["inUnpublishedDraw"] is False, body)
st = sql("select QualifiedAt, ReadinessRejectionReason from TournamentEntries where Id=?", (B,))[0]
check("the approval is lifted", st[0] is None and st[1] == "Licence found to be forged.", st)
line = audits(B, "tournament.readiness_rejected")[-1]
check("and the audit keeps the approval it replaced", line[0] == "qualified" and "Replaces Approved" in line[2], line)

B_BOUT = in_bracket(B)
sql("update TournamentDivisions set DrawPublishedAt=datetime('now') where Id=(select DivisionId from TournamentEntries where Id=?)", (B,))
status, _ = approve_entry(B, DIRECTOR, "Changed my mind.")
check("no decision change once the draw is published", status == 409, status)
sql("update TournamentDivisions set DrawPublishedAt=NULL where Id=(select DivisionId from TournamentEntries where Id=?)", (B,))
out_of_bracket(B_BOUT)

status, _ = reject(E, "Not ready.", DIRECTOR)
check("an athlete who has not passed all three cannot be rejected", status == 409, status)
status, _ = approve_entry(E, DIRECTOR)
check("nor approved", status == 409, status)
status, _ = approve_entry(A, DIRECTOR)
check("approving twice is refused", status == 409, status)

# A change after a draw is made but not published: it has to be redrawn.
weigh(E, 54, "passed")
approve_entry(E, DIRECTOR)
status, made = call("POST", base("/divisions/%d/draw" % U18M[54]), {"seed": 7}, token=ADMIN)
check("a draw is made for the 54 kg class (unpublished)", status == 200, made)
status, body = reject(E, "Late medical disclosure.", DIRECTOR)
check("rejecting an athlete in an unpublished draw is allowed and flagged for a redraw",
      status == 200 and body["inUnpublishedDraw"] is True, body)
check("the audit says the draw must be redrawn", "must be redrawn" in audits(E, "tournament.readiness_rejected")[-1][2])

say("")
say("=== the examination desk edits the athlete's own Medical File ===")
adult_id, _, ADULT_TOKEN = athlete(20, "male")
ADULT = admin_enter(adult_id, DIV[("u24", "male", 54)])
check_in(ADULT)
answers_url = base("/entries/%d/medical/answers" % ADULT)
status, view = call("PUT", answers_url, {"healthAnswers": {"ko_6_months": True, "medication_now": True},
                                         "medications": "Ibuprofen 400 mg"}, token=TECH)
check("the technical team saves health answers and medication details", status == 200, view)
q = {x["key"]: x["answer"] for x in view["questions"]}
check("and reads them back at once", q["ko_6_months"] is True and q["medication_now"] is True
      and view["medications"] == "Ibuprofen 400 mg", (q, view["medications"]))
f = sql("select HealthAnswersJson, Medications, count(*) from AthleteMedicalFiles where AthleteRegistrationId=?", (adult_id,))[0]
check("on the athlete's one existing Medical File", f[2] == 1 and "ko_6_months" in f[0] and f[1] == "Ibuprofen 400 mg", f)
status, mine = call("GET", "/api/member/me/medical/requirements", token=ADULT_TOKEN)
check("which the athlete's own account reads the same way", status == 200, status)
status, view = call("PUT", answers_url, {"healthAnswers": {"ko_6_months": None}}, token=TECH)
check("an answer can be set back to not answered",
      status == 200 and {x["key"]: x["answer"] for x in view["questions"]}["ko_6_months"] is None, view["questions"][:1])
status, view = call("PUT", answers_url, {"healthAnswers": {"medication_now": False}}, token=TECH)
check("answering No to medication clears the details", status == 200 and view["medications"] is None, view.get("medications"))
status, view = call("PUT", answers_url, {"declarations": {"media": True, "anti_doping": False}}, token=TECH)
d = {x["key"]: x["accepted"] for x in view["declarations"]}
check("adult electronic declarations are saved", status == 200 and d["media"] is True and d["anti_doping"] is False, d)
check("an unknown question is refused", call("PUT", answers_url, {"healthAnswers": {"made_up": True}}, token=TECH)[0] == 400)
check("an unknown declaration is refused", call("PUT", answers_url, {"declarations": {"made_up": True}}, token=TECH)[0] == 400)
check("the non-pregnancy declaration does not apply to a man",
      call("PUT", answers_url, {"notPregnantDeclared": True}, token=TECH)[0] == 400)
minor_url = base("/entries/%d/medical/answers" % G)
check("electronic declarations do not apply under 18",
      call("PUT", minor_url, {"declarations": {"media": True}}, token=TECH)[0] == 400)
check("the director alone cannot edit medical data", call("PUT", answers_url, {"healthAnswers": {"wada_positive": True}}, token=DIRECTOR)[0] == 403)
check("nor entries-only", call("PUT", answers_url, {"healthAnswers": {"wada_positive": True}}, token=ENTRIES)[0] == 403)
check("the director alone cannot read the medical file either", call("GET", base("/entries/%d/medical" % ADULT), token=DIRECTOR)[0] == 403)
edits = sql("select Details from AuditLog where Action='athlete.medical_file_edited' and EntityRef=? order by Id", ("entry #%d" % ADULT,))
check("each saved edit is audited with entry, tournament and what changed",
      len(edits) == 4 and "health answers changed (2)" in edits[0][0] and "tournament #%d" % T in edits[0][0]
      and "declarations changed: media, anti_doping" in edits[3][0], [e[0][:90] for e in edits])
check("without the medical values themselves", all("Ibuprofen" not in e[0] for e in edits))
check("a save that changes nothing writes no audit line",
      call("PUT", answers_url, {"declarations": {"media": True}}, token=TECH)[0] == 200
      and len(sql("select Id from AuditLog where Action='athlete.medical_file_edited' and EntityRef=?", ("entry #%d" % ADULT,))) == 4)
check("editing the file does not record an examination result", entry_row(ADULT)[7] is None, entry_row(ADULT)[7])

status, up = upload(base("/entries/%d/medical/documents/guardian_consent" % G), TECH)
check("a signed guardian form is uploaded for the minor", status == 200 and up["replaced"] is False, up)
status, up = upload(base("/entries/%d/medical/documents/guardian_consent" % G), TECH, name="consent-v2.png")
check("and replaced, not edited", status == 200 and up["replaced"] is True, up)
status, _ = call("GET", base("/entries/%d/medical/documents/guardian_consent" % G), token=TECH)
check("and viewed", status == 200, status)

say("")
say("=== after Final Approval the medical file is the director's ===")
check("A is approved", entry_row(A)[0] == "qualified")
qualified_at = sql("select QualifiedAt from TournamentEntries where Id=?", (A,))[0][0]
a_answers = base("/entries/%d/medical/answers" % A)
status, body = call("PUT", a_answers, {"healthAnswers": {"glasses_or_lenses": True}}, token=TECH)
check("technical-only staff can no longer edit an approved athlete's answers", status == 403, body)
status, _ = upload(base("/entries/%d/medical/documents/certificate" % A), TECH)
check("nor upload or replace their documents", status == 403, status)
check("entries-only is refused too", call("PUT", a_answers, {"healthAnswers": {"glasses_or_lenses": True}}, token=ENTRIES)[0] == 403)
status, view = call("GET", base("/entries/%d/medical" % A), token=DIRECTOR)
check("the director may read the approved athlete's file", status == 200, status)
status, view = call("PUT", a_answers, {"healthAnswers": {"glasses_or_lenses": True}}, token=DIRECTOR)
check("and change it", status == 200 and {q["key"]: q["answer"] for q in view["questions"]}["glasses_or_lenses"] is True, view)
status, up = upload_dated(base("/entries/%d/medical/documents/certificate" % A), DIRECTOR)
check("the director replaces a document after approval", status == 200, up)
line = sql("select Details from AuditLog where Action like 'athlete.medical_document_%' order by Id desc limit 1")[0][0]
check("the upload audit says it was after Final Approval", "after Final Approval" in line, line[-80:])
edit = sql("select Details from AuditLog where Action='athlete.medical_file_edited' and EntityRef=? order by Id desc limit 1", ("entry #%d" % A,))[0][0]
check("the edit audit says so too, without the answer itself",
      "after Final Approval" in edit and "health answers changed (1)" in edit and "glasses" not in edit and "True" not in edit, edit)
st = sql("select Status, QualifiedAt, MedicalResult from TournamentEntries where Id=?", (A,))[0]
check("and neither the approval nor the examination result is reset", st == ("qualified", qualified_at, "passed"), st)
status, _ = call("GET", base("/entries/%d/medical" % ADULT), token=DIRECTOR)
check("the director still cannot read a file before approval", status == 403, status)
status, _ = call("PUT", base("/entries/%d/medical/answers" % ADULT), {"healthAnswers": {"wada_positive": False}}, token=TECH)
check("and the technical team still edits before approval", status == 200, status)

say("")
say("=== the draw takes only Final Approval, and publication checks it again ===")
status, body = call("POST", base("/divisions/%d/draw" % U18M[51]), {"seed": 3}, token=ADMIN)
check("Failed, DSQ and rejected athletes never make a draw pool", status == 409, body)

pair = []
for _ in range(2):
    rid = athlete(21, "male")[0]
    e = admin_enter(rid, DIV[("u24", "male", 57)])
    check_in(e); medical(e, "passed"); weigh(e, 56, "passed")
    call("POST", base("/entries/%d/approve" % e), token=DIRECTOR)
    pair.append(e)
D57 = DIV[("u24", "male", 57)]
status, _ = call("POST", base("/divisions/%d/draw" % D57), {"seed": 5}, token=ADMIN)
check("two approved athletes make a draft", status == 200, status)
# Lost eligibility after the draft — simulated directly on the throwaway database.
sql("update TournamentEntries set Status='disqualified' where Id=?", (pair[0],))
status, body = call("POST", base("/divisions/%d/draw/publish" % D57), token=ADMIN)
check("publication is blocked for a DSQ athlete in the draft", status == 409, body)
check("naming the athlete, the reason and the division",
      [i["entryId"] for i in body["ineligible"]] == [pair[0]] and body["ineligible"][0]["reason"] == "DSQ (No Show)"
      and body["ineligible"][0]["memberId"] and "57 kg" in body["division"]["label"] and "redraw" in body["message"], body)
check("nothing was published", sql("select DrawPublishedAt from TournamentDivisions where Id=?", (D57,))[0][0] is None)
sql("update TournamentEntries set Status='not_eligible', WeighInResult='failed' where Id=?", (pair[0],))
status, body = call("POST", base("/divisions/%d/draw/publish" % D57), token=ADMIN)
check("and for an athlete who has since Failed", status == 409 and body["ineligible"][0]["reason"] == "Failed the weigh-in", body)
sql("update TournamentEntries set Status='qualified', WeighInResult='passed' where Id=?", (pair[0],))
bouts_before = sql("select count(*) from Bouts where DivisionId=?", (D57,))[0][0]
check("the draft itself was left alone", bouts_before >= 1, bouts_before)
status, _ = call("POST", base("/divisions/%d/draw/publish" % D57), token=ADMIN)
check("once everyone is eligible again it publishes", status == 200, status)

# The 54 kg draft from earlier holds A (approved) and E (rejected).
status, body = call("POST", base("/divisions/%d/draw/publish" % U18M[54]), token=ADMIN)
check("a draft holding a Rejected athlete cannot be published", status == 409, body)
check("only the rejected athlete is named", [i["entryId"] for i in body["ineligible"]] == [E]
      and body["ineligible"][0]["reason"] == "Rejected at Final Approval", body.get("ineligible"))
status, _ = call("POST", base("/entries/%d/approve" % E), {"reason": "Disclosure was a clerical error."}, token=DIRECTOR)
check("the director corrects the decision before publication", status == 200, status)
status, _ = call("POST", base("/divisions/%d/draw/publish" % U18M[54]), token=ADMIN)
check("and the draft publishes", status == 200, status)

status, _ = call("PUT", a_answers, {"healthAnswers": {"glasses_or_lenses": False}}, token=DIRECTOR)
check("after publication even the director cannot change the medical file here", status == 409, status)
status, _ = upload_dated(base("/entries/%d/medical/documents/certificate" % A), DIRECTOR)
check("nor its documents", status == 409, status)
status, _ = call("POST", base("/entries/%d/reject" % E), {"reason": "Late."}, token=DIRECTOR)
check("nor can the decision change", status == 409, status)

late = admin_enter(athlete(17, "male")[0], U18M[54])
check_in(late)
_, bracket = call("GET", base("/divisions/%d/draw" % U18M[54]), token=ADMIN)
first_bout = bracket["rounds"][0]["bouts"][0]["id"]
status, body = call("PUT", base("/bouts/%d/corner" % first_bout),
                    {"corner": "blue", "entryId": late, "reason": "Late arrival."}, token=ADMIN)
check("an athlete without Final Approval cannot be placed into a draw by amendment", status == 409, body)

say("")
say("=== document states and dates come from the file itself ===")
fresh_id, _, FRESH = athlete(20, "male")
FRESH_ENTRY = admin_enter(fresh_id, DIV[("u24", "male", 54)])
status, _ = call("PUT", "/api/member/me/medical", {"certificateDate": (TODAY - datetime.timedelta(days=2)).isoformat()}, token=FRESH)
check("an athlete's date sent without a document is accepted", status == 200, status)
check("but not stored on its own", sql("select CertificateDate from AthleteMedicalFiles where AthleteRegistrationId=?",
                                       (fresh_id,))[0][0] is None)
status, view = call("GET", base("/entries/%d/medical" % FRESH_ENTRY), token=TECH)
cert = next(d for d in view["documents"] if d["key"] == "certificate")
check("a missing document reads Missing, no date, nothing to view",
      cert["status"] == "missing" and cert["date"] is None and cert["viewable"] is False, cert)
st, att = upload("/api/member/me/medical/attachments", FRESH)
day = (TODAY - datetime.timedelta(days=5)).isoformat()
call("PUT", "/api/member/me/medical", {"certificateAttachmentId": att["id"], "certificateDate": day}, token=FRESH)
cert = next(d for d in call("GET", base("/entries/%d/medical" % FRESH_ENTRY), token=TECH)[1]["documents"] if d["key"] == "certificate")
check("the athlete's own first upload reads uploaded (awaiting approval), viewable, with its date",
      cert["status"] == "uploaded" and cert["viewable"] is True and cert["date"].startswith(day), cert)
st, att2 = upload("/api/member/me/medical/attachments", FRESH, name="cert-v2.png")
call("PUT", "/api/member/me/medical", {"certificateAttachmentId": att2["id"], "certificateDate": day}, token=FRESH)
cert = next(d for d in call("GET", base("/entries/%d/medical" % FRESH_ENTRY), token=TECH)[1]["documents"] if d["key"] == "certificate")
check("a replacement waiting for approval is flagged, the document in use unchanged",
      cert["replacementPending"] is True and cert["status"] == "uploaded", cert)
call("POST", "/api/admin/athletes/%d/medical/reject" % fresh_id, {"reason": "Blurred."}, token=TECH)
cert = next(d for d in call("GET", base("/entries/%d/medical" % FRESH_ENTRY), token=TECH)[1]["documents"] if d["key"] == "certificate")
check("a rejected replacement leaves the original in use, no longer flagged",
      cert["replacementPending"] is False and cert["status"] == "uploaded" and cert["viewable"], cert)
status, _ = upload_dated(base("/entries/%d/medical/documents/certificate" % FRESH_ENTRY), TECH)
cert = next(d for d in call("GET", base("/entries/%d/medical" % FRESH_ENTRY), token=TECH)[1]["documents"] if d["key"] == "certificate")
check("an authorised admin upload reads approved", status == 200 and cert["status"] == "approved", cert)
check("a director-only user cannot view a document before approval",
      call("GET", base("/entries/%d/medical/documents/certificate" % FRESH_ENTRY), token=DIRECTOR)[0] == 403)

say("")
say("=== Final Approval locks the athlete's own Medical File, everywhere ===")
m_id, _, MEMBER = athlete(22, "male")
M_ENTRY = admin_enter(m_id, DIV[("u24", "male", 54)])
status, _ = call("PUT", "/api/member/me/medical", {"healthAnswers": {"ko_6_months": False}}, token=MEMBER)
check("before Final Approval the athlete edits their answers", status == 200, status)
st, att = upload("/api/member/me/medical/attachments", MEMBER)
check("and uploads documents", st == 200, st)
check_in(M_ENTRY); medical(M_ENTRY, "passed"); weigh(M_ENTRY, 53.8, "passed")
status, _ = call("POST", base("/entries/%d/approve" % M_ENTRY), token=DIRECTOR)
check("the athlete is approved", status == 200, status)
status, body = call("PUT", "/api/member/me/medical", {"healthAnswers": {"ko_6_months": True}}, token=MEMBER)
check("afterwards their answers are refused", status == 409 and "Final Approval" in body["messageEn"], body)
status, _ = call("PUT", "/api/member/me/medical", {"medications": "x", "healthAnswers": {"medication_now": True}}, token=MEMBER)
check("their medication details too", status == 409, status)
status, _ = call("PUT", "/api/member/me/medical", {"declarations": {"media": False}}, token=MEMBER)
check("and their declarations", status == 409, status)
st, _ = upload("/api/member/me/medical/attachments", MEMBER)
check("no document can be uploaded or replaced", st == 409, st)
status, _ = call("PUT", "/api/member/me/medical", {"certificateAttachmentId": att["id"]}, token=MEMBER)
check("not even with a file stored before the lock", status == 409, status)
check("the file did not change", sql("select HealthAnswersJson, CertificateAttachmentId from AthleteMedicalFiles where AthleteRegistrationId=?",
                                     (m_id,))[0] == ('{"ko_6_months":false}', None))
status, view = call("GET", "/api/member/me/medical", token=MEMBER)
check("the athlete can still read the file, and is told it is locked",
      status == 200 and view["medicalLock"]["locked"] and view["medicalLock"]["tournaments"][0]["tournamentId"] == T, view.get("medicalLock"))
status, req = call("GET", "/api/member/me/medical/requirements", token=MEMBER)
check("the Medical File page knows it too", status == 200 and req["medicalLock"]["locked"], req.get("medicalLock"))

LATER = tournament(["u24"], ["male"], {"u24:male": [54]})
status, form = call("GET", "/api/member/tournaments/%d/registration" % LATER, token=MEMBER)
check("a registration form elsewhere shows the file locked", status == 200 and form["medical"]["medicalLock"]["locked"], form.get("medical", {}).get("medicalLock"))
option = next(o for o in form["eligibility"]["eligibleCategories"] if o["category"] == "u24")
later_div = option["divisions"][0]["divisionId"]
status, made = call("POST", "/api/member/tournaments/%d/entries" % LATER,
                    {"athleteRegistrationId": m_id, "divisionId": later_div, "clubName": "Club",
                     "medical": {"healthAnswers": {"ko_6_months": True}}}, token=MEMBER)
check("a new entry is still made", status == 200, made)
check("but its medical part is not applied, and the response says so", made.get("medicalNotApplied") == "locked", made)
check("the file is unchanged", sql("select HealthAnswersJson from AthleteMedicalFiles where AthleteRegistrationId=?", (m_id,))[0][0] == '{"ko_6_months":false}')

other_entry = made["id"]
status, _ = call("PUT", base("/entries/%d/medical/answers" % other_entry), {"healthAnswers": {"ko_6_months": True}}, token=TECH)
check("technical staff are blocked through the other tournament's entry too (the file is shared)", status == 403, status)
status, _ = upload_dated(base("/entries/%d/medical/documents/certificate" % other_entry), TECH)
check("for documents as well", status == 403, status)
check("and through the desk route", call("PUT", "/api/admin/athletes/%d/medical" % m_id, {"healthAnswers": {"ko_6_months": True}}, token=TECH)[0] == 403)
check("and for approving a pending replacement", call("POST", "/api/admin/athletes/%d/medical/approve" % m_id, token=TECH)[0] in (403,))
status, _ = call("GET", base("/entries/%d/medical" % other_entry), token=DIRECTOR)
check("the director may read it through any of the athlete's entries", status == 200, status)
status, view = call("PUT", base("/entries/%d/medical/answers" % other_entry), {"healthAnswers": {"ko_6_months": True}}, token=DIRECTOR)
check("and change it", status == 200, status)
line = sql("select Details from AuditLog where Action='athlete.medical_file_edited' order by Id desc limit 1")[0][0]
check("recorded as after Final Approval, without the value", "after Final Approval" in line and "true" not in line.lower().split("tournament")[-1], line)
check("the readiness list flags the shared lock on the other tournament's row",
      next(x for x in call("GET", base("/%d/readiness" % LATER), token=ADMIN)[1]["athletes"] if x["id"] == other_entry)["medicalLocked"] is True)

sql("update TournamentDivisions set DrawPublishedAt=datetime('now') where Id=?", (DIV[("u24", "male", 54)],))
status, _ = call("PUT", base("/entries/%d/medical/answers" % other_entry), {"healthAnswers": {"ko_6_months": False}}, token=DIRECTOR)
check("once the approved draw is published even the director is refused, through any entry", status == 409, status)
sql("update TournamentDivisions set DrawPublishedAt=NULL where Id=?", (DIV[("u24", "male", 54)],))

say("")
say("=== the tournament banner: upload, replace, remove, and who may ===")
def upload_bytes(path, token, name, data, ctype):
    boundary = "----smf" + uuid.uuid4().hex
    body = (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\n"
             "Content-Type: %s\r\n\r\n" % (boundary, name, ctype)).encode() + data
            + ("\r\n--%s--\r\n" % boundary).encode())
    head = {"Content-Type": "multipart/form-data; boundary=" + boundary, "Authorization": "Bearer " + token}
    request = urllib.request.Request(API + path, data=body, method="POST", headers=head)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()

PNG_BYTES = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                          "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082")
banner = base("/%d/banner" % T)
status, body = upload_bytes(banner, ADMIN, "banner.png", PNG_BYTES, "image/png")
check("a banner is uploaded", status == 200 and str(body.get("bannerImageUrl", "")).startswith("/api/media/"), body)
first_url = body["bannerImageUrl"]
check("the admin detail returns it", call("GET", base("/%d" % T), token=ADMIN)[1]["tournament"]["bannerImageUrl"] == first_url)
public = call("GET", "/api/events/tournament-%d?lang=ar" % T)[1]
check("and the public page receives it as its image", public["activity"]["imageUrl"] == first_url, public["activity"].get("imageUrl"))
req = urllib.request.Request(API + first_url)
with urllib.request.urlopen(req) as media:
    check("the image itself is served", media.status == 200 and media.headers["Content-Type"] == "image/png", media.headers["Content-Type"])
status, body = upload_bytes(banner, ADMIN, "banner-2.png", PNG_BYTES, "image/png")
check("a second upload replaces it", status == 200 and body["bannerImageUrl"] != first_url, body)
check("another tournament's image is untouched",
      call("GET", "/api/events/tournament-%d?lang=ar" % LATER)[1]["activity"]["imageUrl"] is None)
check("a GIF is refused", upload_bytes(banner, ADMIN, "b.gif", b"GIF89a" + b"\0" * 20, "image/gif")[0] == 400)
check("a PDF is refused", upload_bytes(banner, ADMIN, "b.pdf", b"%PDF-1.4 x", "application/pdf")[0] == 400)
check("a file whose bytes are not the image it claims is refused",
      upload_bytes(banner, ADMIN, "fake.png", b"<html>not an image</html>", "image/png")[0] == 400)
check("an image over 5 MB is refused",
      upload_bytes(banner, ADMIN, "big.png", PNG_BYTES + b"\0" * (5 * 1024 * 1024), "image/png")[0] == 400)
check("refused uploads leave the banner as it was",
      call("GET", base("/%d" % T), token=ADMIN)[1]["tournament"]["bannerImageUrl"] == body["bannerImageUrl"])
MANAGE_ONLY = account_with(["tournament.manage"])
APPROVER = account_with(["tournament.approve"])
check("the technical team cannot change it", upload_bytes(banner, TECH, "x.png", PNG_BYTES, "image/png")[0] == 403)
check("nor the director", upload_bytes(banner, DIRECTOR, "x.png", PNG_BYTES, "image/png")[0] == 403)
check("nor entries-only", upload_bytes(banner, ENTRIES, "x.png", PNG_BYTES, "image/png")[0] == 403)
check("manage-only cannot change a published tournament's banner (it needs the approval permission, as editing does)",
      upload_bytes(banner, MANAGE_ONLY, "x.png", PNG_BYTES, "image/png")[0] == 403)
check("the approval permission can", upload_bytes(banner, APPROVER, "x.png", PNG_BYTES, "image/png")[0] == 200)
check("removing needs the same permission", call("DELETE", banner, token=TECH)[0] == 403)
status, body = call("DELETE", banner, token=APPROVER)
check("it is removed", status == 200 and body["bannerImageUrl"] is None, body)
check("and the public page is back to no image",
      call("GET", "/api/events/tournament-%d?lang=en" % T)[1]["activity"]["imageUrl"] is None)
lines = sql("select Details from AuditLog where Action='tournament.updated' and EntityId=? and Details like 'Banner%' order by Id", (T,))
check("each change is audited", [l[0].split(":")[0] for l in lines][:2] == ["Banner image added", "Banner image replaced"]
      and lines[-1][0] == "Banner image removed.", [l[0][:30] for l in lines])

say("")
say("=== the on-site check-in, medical examination and weigh-in window ===")
def setup_body(**extra):
    body = {
        "nameAr": "بطولة الجدول", "nameEn": "Schedule Cup " + latin(),
        "type": "local", "competitionType": "muaythai_combat",
        "locationAr": "الرياض", "locationEn": "Riyadh",
        "startDate": START.isoformat(), "endDate": (START + datetime.timedelta(days=1)).isoformat(),
        "registrationClosesAt": (TODAY + datetime.timedelta(days=30)).isoformat() + "T00:00:00",
        "firstBoutTime": "17:00:00", "genders": ["male"], "categories": ["elite"],
        "activityCategory": "regional", "exactWeightClasses": True, "weightClasses": {"elite:male": [60]},
    }
    body.update(extra)
    return body

day_before = (START - datetime.timedelta(days=1)).isoformat()
window = {"startsAt": day_before + "T10:00:00", "endsAt": day_before + "T15:00:00"}
status, made = call("POST", "/api/admin/tournaments", setup_body(onSiteSchedule=window), token=ADMIN)
check("a tournament is created with its on-site window", status in (200, 201), made)
SCHED = made["id"]
t = call("GET", base("/%d" % SCHED), token=ADMIN)[1]["tournament"]
check("the admin detail returns it", str(t["onSiteCheckInStartsAt"]).startswith(day_before + "T10:00")
      and str(t["onSiteCheckInEndsAt"]).startswith(day_before + "T15:00"), (t["onSiteCheckInStartsAt"], t["onSiteCheckInEndsAt"]))
call("POST", base("/%d/publish" % SCHED), token=ADMIN)
pub = call("GET", "/api/events/tournament-%d?lang=en" % SCHED)[1]["tournament"]
check("and the public page receives it", str(pub["onSiteCheckInStartsAt"]).startswith(day_before + "T10:00")
      and str(pub["onSiteCheckInEndsAt"]).startswith(day_before + "T15:00"), pub)
check("a tournament without one sends nothing to show",
      call("GET", "/api/events/tournament-%d?lang=en" % LATER)[1]["tournament"]["onSiteCheckInStartsAt"] is None)

bad = {"startsAt": day_before + "T15:00:00", "endsAt": day_before + "T10:00:00"}
check("an end before the start is refused",
      call("POST", "/api/admin/tournaments", setup_body(onSiteSchedule=bad), token=ADMIN)[0] == 400)
check("an end without a start is refused",
      call("POST", "/api/admin/tournaments", setup_body(onSiteSchedule={"startsAt": None, "endsAt": window["endsAt"]}), token=ADMIN)[0] == 400)
after = (START + datetime.timedelta(days=3)).isoformat() + "T10:00:00"
check("a start after the last competition day is refused",
      call("POST", "/api/admin/tournaments", setup_body(onSiteSchedule={"startsAt": after, "endsAt": None}), token=ADMIN)[0] == 400)
check("a start alone (no end) is accepted",
      call("POST", "/api/admin/tournaments", setup_body(onSiteSchedule={"startsAt": window["startsAt"], "endsAt": None}), token=ADMIN)[0] in (200, 201))

# Editing: the banner and the window survive an update that does not touch them.
upload_bytes(base("/%d/banner" % SCHED), ADMIN, "b.png", PNG_BYTES, "image/png")
kept_banner = call("GET", base("/%d" % SCHED), token=ADMIN)[1]["tournament"]["bannerImageUrl"]
status, _ = call("PUT", base("/%d" % SCHED), setup_body(nameEn="Schedule Cup renamed"), token=ADMIN)
check("an edit of other fields is saved", status == 200, status)
t = call("GET", base("/%d" % SCHED), token=ADMIN)[1]["tournament"]
check("and keeps the banner", t["bannerImageUrl"] == kept_banner and kept_banner, t["bannerImageUrl"])
check("and keeps the on-site window when the request does not mention it", t["onSiteCheckInStartsAt"] is not None, t["onSiteCheckInStartsAt"])
moved = {"startsAt": day_before + "T09:00:00", "endsAt": day_before + "T13:00:00"}
call("PUT", base("/%d" % SCHED), setup_body(nameEn="Schedule Cup renamed", onSiteSchedule=moved), token=ADMIN)
t = call("GET", base("/%d" % SCHED), token=ADMIN)[1]["tournament"]
check("the window can be changed", str(t["onSiteCheckInStartsAt"]).startswith(day_before + "T09:00"), t["onSiteCheckInStartsAt"])
call("PUT", base("/%d" % SCHED), setup_body(nameEn="Schedule Cup renamed", onSiteSchedule={"startsAt": None, "endsAt": None}), token=ADMIN)
t = call("GET", base("/%d" % SCHED), token=ADMIN)[1]["tournament"]
check("and cleared", t["onSiteCheckInStartsAt"] is None and t["onSiteCheckInEndsAt"] is None, t)
check("the banner is still there after both edits", t["bannerImageUrl"] == kept_banner)
check("the technical team cannot edit the tournament", call("PUT", base("/%d" % SCHED), setup_body(onSiteSchedule=window), token=TECH)[0] == 403)

say("")
say("=== a Passed examination with documents missing needs its reason (REQ-08 rule 6) ===")
MR = tournament(["u12", "elite"], ["male", "female"],
                {"u12:male": [36], "u12:female": [36], "elite:male": [60], "elite:female": [57]})
_, mr_detail = call("GET", base("/%d" % MR), token=ADMIN)
MR_DIV = {(d["category"], d["gender"]): d["id"] for d in mr_detail["divisions"]}


def mr_enter(age, gender, category):
    rid, _, _ = athlete(age, gender)
    st, made = call("POST", base("/%d/entries" % MR),
                    {"athleteRegistrationId": rid, "divisionId": MR_DIV[(category, gender)],
                     "declaredWeightKg": 50, "clubName": "Reason Club"}, token=ADMIN)
    assert st == 200, made
    call("POST", base("/entries/%d/check-in" % made["id"]), token=TECH)
    return rid, made["id"]


ALL_ANSWERS = json.dumps({k: False for k in ["ko_6_months", "wada_positive", "medication_now", "surgery_6_months",
                                              "hospital_6_months", "fracture_6_months", "glasses_or_lenses",
                                              "spine_surgery"]})
ALL_DECLARED = json.dumps({k: True for k in ["participation", "media", "anti_doping", "data_accuracy"]})


def medical_file(rid, **fields):
    """A Medical File for the athlete, written straight into the throwaway database."""
    columns = {"AthleteRegistrationId": rid, "CreatedAt": datetime.datetime.utcnow().isoformat(sep=" ")}
    columns.update(fields)
    sql("insert into AthleteMedicalFiles (%s) values (%s)" % (", ".join(columns), ", ".join("?" * len(columns))),
        tuple(columns.values()))


def missing_list(entry_id):
    return [m["en"] for m in entry_row_api(entry_id)["medicalMissing"]]


def entry_row_api(entry_id):
    return next(e for e in call("GET", base("/%d/entries" % MR), token=ADMIN)[1] if e["id"] == entry_id)


def stored(entry_id):
    return sql("select MedicalResult, MedicalNote, MedicalMissingDocumentsReason, Status from TournamentEntries where Id=?",
               (entry_id,))[0]


REASON_MSG = "One or more required documents are missing. A reason is required to pass the medical examination."

# Complete adult man: certificate, screening, every answer and declaration.
rid, COMPLETE = mr_enter(25, "male", "elite")
medical_file(rid, CertificateAttachmentId="c1", ScreeningAttachmentId="s1", HealthAnswersJson=ALL_ANSWERS,
             DeclarationsJson=ALL_DECLARED)
check("a complete adult file has nothing missing", missing_list(COMPLETE) == [], missing_list(COMPLETE))
status, body = medical(COMPLETE, "passed", missing_reason=None)
check("all documents complete: Passed saves without a reason", status == 200, body)
check("and no missing-documents reason is stored", stored(COMPLETE)[2] is None, stored(COMPLETE))

# Complete boy of 11: the guardian consent applies, the non-pregnancy form does not.
rid, BOY = mr_enter(11, "male", "u12")
medical_file(rid, CertificateAttachmentId="c2", HealthAnswersJson=ALL_ANSWERS, GuardianConsentAttachmentId="g2")
check("a boy's file needs no non-pregnancy document", missing_list(BOY) == [], missing_list(BOY))
check("so a document that does not apply never asks for the reason",
      medical(BOY, "passed", missing_reason=None)[0] == 200)

# Adult woman missing only the pregnancy declaration.
rid, ONE = mr_enter(25, "female", "elite")
medical_file(rid, CertificateAttachmentId="c3", ScreeningAttachmentId="s3", HealthAnswersJson=ALL_ANSWERS,
             DeclarationsJson=ALL_DECLARED)
check("one document missing", missing_list(ONE) == ["Pregnancy declaration"], missing_list(ONE))
status, body = medical(ONE, "passed", missing=True, missing_reason=None)
check("one missing: Passed without a reason is refused", status == 400 and body.get("messageEn") == REASON_MSG, body)
status, body = medical(ONE, "passed", missing_reason="   \n  ")
check("a reason of only spaces is refused", status == 400, body)
status, body = medical(ONE, "passed", missing=False, missing_reason=None)
check("claiming nothing is missing does not get round it", status == 400, body)
check("and nothing was saved", stored(ONE)[0] is None, stored(ONE))
status, body = medical(ONE, "passed", missing_reason="  Declaration signed on paper, scan to follow.  ")
check("with a reason, Passed is saved", status == 200 and body["medicalResult"] == "passed", body)
check("the reason is stored on its own, trimmed",
      stored(ONE)[1] is None and stored(ONE)[2] == "Declaration signed on paper, scan to follow.", stored(ONE))
check("the document itself is still missing", missing_list(ONE) == ["Pregnancy declaration"], missing_list(ONE))
status, view = call("GET", base("/%d/readiness" % MR), token=TECH)
one_row = next(a for a in view["athletes"] if a["id"] == ONE)
check("the desk shows the reason when the record is reopened",
      one_row["medical"]["missingDocumentsReason"] == "Declaration signed on paper, scan to follow.", one_row["medical"])
check("and the athlete moves on to the weigh-in, not to approval",
      one_row["step"] == 3 and one_row["qualified"] is None, (one_row["state"], one_row["step"]))
status, _ = weigh(ONE, 56, "passed")
check("the weigh-in can then be recorded", status == 200, status)
audit_row = sql("select ActorName, Details from AuditLog where EntityType='tournament_entry' and EntityId=? "
                "and Action='tournament.medical_recorded' order by Id desc limit 1", (ONE,))
check("the audit names who passed it, what was missing and the reason",
      audit_row and audit_row[0][0] == "admin" and "Pregnancy declaration" in audit_row[0][1]
      and "Declaration signed on paper" in audit_row[0][1], audit_row)

# Girl of 11 with no file at all: several documents missing.
_, MANY = mr_enter(11, "female", "u12")
check("several documents missing", len(missing_list(MANY)) >= 3, missing_list(MANY))
check("several missing: Passed without a reason is refused", medical(MANY, "passed", missing_reason=None)[0] == 400)
check("with a reason it is saved", medical(MANY, "passed", missing_reason="Guardian bringing the forms.")[0] == 200)

# Failed is unchanged: its own reason, and the missing-documents reason does not apply.
rid, FAIL = mr_enter(25, "male", "elite")
check("Failed still needs the reason for failure", medical(FAIL, "failed", note=None)[0] == 400)
status, _ = medical(FAIL, "failed", note="Blood pressure too high.")
check("Failed with its reason is saved", status == 200 and stored(FAIL)[1] == "Blood pressure too high."
      and stored(FAIL)[2] is None, stored(FAIL))
# A correction from Failed to Passed with documents missing needs both reasons.
status, body = medical(FAIL, "passed", correction="Re-examined.", missing_reason=None)
check("Failed → Passed with documents missing needs the missing-documents reason too", status == 400, body)
status, body = medical(FAIL, "passed", correction="Re-examined.", missing_reason="Certificate at home.")
check("and with both reasons it is saved", status == 200 and stored(FAIL)[2] == "Certificate at home.", stored(FAIL))

# Documents completed before saving: the reason is no longer needed.
rid, LATER = mr_enter(25, "male", "elite")
check("missing to begin with", medical(LATER, "passed", missing_reason=None)[0] == 400)
medical_file(rid, CertificateAttachmentId="c4", ScreeningAttachmentId="s4", HealthAnswersJson=ALL_ANSWERS,
             DeclarationsJson=ALL_DECLARED)
status, _ = medical(LATER, "passed", missing_reason="Ignored now.")
check("once the file is complete, Passed saves and keeps no reason", status == 200 and stored(LATER)[2] is None,
      stored(LATER))

say("")
say("FAILED: " + (", ".join(failures) if failures else "none"))
sys.exit(1 if failures else 0)
