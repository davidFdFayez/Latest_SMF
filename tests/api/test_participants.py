"""
The admin Participants page — who is registered in a tournament, by division.

Division grouping and its order, the snapshot details, the Medical File status
worked out at the tournament's competition age (HIV above 15, under-18 vs adult
documents), the category / weight-class correction (eligibility and the
tournament's own classes enforced, the entry changed and the profile not, the
change audited), the CSV export, and who may do what.
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


def club():
    email = "r3c%s@example.com" % uuid.uuid4().hex[:8]
    rid = register("club", {
        "firstNameAr": "خالد", "fatherNameAr": "علي", "familyNameAr": "الدوسري",
        "firstNameEn": "Khalid", "fatherNameEn": "Ali", "familyNameEn": "Al" + latin(),
        "applicantRole": "owner", "applicantId": "1" + str(uuid.uuid4().int)[:9],
        "nationality": "SA", "applicantPhone": "+966512345678",
        "applicantEmail": "app%s@example.com" % uuid.uuid4().hex[:8], "officialEmail": email,
        "region": "الرياض", "city": "الرياض", "nameAr": "نادي الفهد", "nameEn": "Fahad Club " + latin(),
        "entityType": "club", "ownerName": "Khalid", "headCoachName": "Coach",
        "headCoachPhone": "+966512345679", "googleMapsUrl": "https://maps.google.com/?q=riyadh", "consent": True,
    })
    return rid, sign_in(email)


def coach():
    email = "r3k%s@example.com" % uuid.uuid4().hex[:8]
    register("coach", {
        "firstNameAr": "سعد", "fatherNameAr": "محمد", "familyNameAr": "القحطاني",
        "firstNameEn": "Saad", "fatherNameEn": "Mohammed", "familyNameEn": "Al" + latin(),
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": "%d-06-15" % (TODAY.year - 35), "nationality": "SA", "gender": "male",
        "phone": "+966512345678", "email": email, "region": "الرياض", "city": "الرياض", "consent": True,
    })
    return email, sign_in(email)


def join(club_token, email, kind, member_token):
    """The club invites, the member accepts: the only way into a club."""
    _, sent = call("POST", "/api/member/roster/invite", {"email": email, "kind": kind}, token=club_token)
    status, _ = call("POST", "/api/member/invitations/%d/accept" % sent["invitationId"], token=member_token)
    assert status == 200, (status, sent)


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


def form(tid, token, athlete_id=None):
    query = "" if athlete_id is None else "?athleteRegistrationId=%d" % athlete_id
    return call("GET", "/api/member/tournaments/%d/registration%s" % (tid, query), token=token)


def enter(tid, token, athlete_id, division_id, **extra):
    body = {"athleteRegistrationId": athlete_id, "divisionId": division_id}
    body.update(extra)
    return call("POST", "/api/member/tournaments/%d/entries" % tid, body, token=token)


def division(view, category, label):
    option = next(o for o in view["eligibility"]["eligibleCategories"] if o["category"] == category)
    return next(d["divisionId"] for d in option["divisions"] if d["labelEn"].endswith(label))


def requirements(token):
    return call("GET", "/api/member/me/medical/requirements", token=token)


def notices(token):
    return call("GET", "/api/member/notifications", token=token)[1]["items"]



WEIGHTS = {
    "u16:male": [48, 51], "u18:female": [45, 48],
    "u24:male": [51, 54], "u24:female": [48, 51],
    "elite:male": [54, 57], "elite:female": [54, 57],
}
T = tournament(["u16", "u18", "u24", "elite"], ["male", "female"], WEIGHTS)
OTHER = tournament(["elite"], ["male"], {"elite:male": [57, 60]})
CLUB_ID, CLUB = club()


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


def participants(tid=T, token=ADMIN):
    return call("GET", "/api/admin/tournaments/%d/participants" % tid, token=token)


def by_athlete(listing, rid):
    return next(p for p in listing["participants"] if p["athleteRegistrationId"] == rid)


def change(entry_id, category, division_id, token=ADMIN, reason="Corrected at the desk."):
    body = {"category": category, "divisionId": division_id}
    if reason is not None:
        body["reason"] = reason
    return call("PUT", "/api/admin/tournaments/entries/%d/category" % entry_id, body, token=token)


say("")
say("=== setup: five athletes, four divisions, one withdrawn ===")
m20_id, m20_email, M20 = athlete(20, "male")
f20_id, f20_email, F20 = athlete(20, "female")
f17_id, _, F17 = athlete(17, "female")
m15_id, _, M15 = athlete(15, "male")
w_id, _, W = athlete(21, "male")
join(CLUB, f20_email, "athlete", F20)

v = form(T, M20)[1]
status, m20_entry = enter(T, M20, m20_id, division(v, "u24", "54 kg"),
                          clubName="Alpha Club", coachName="Coach A", coachPhone="+966500000001",
                          declaredWeightKg=53.4, heightCm=176)
assert status == 200, m20_entry
v = form(T, CLUB, f20_id)[1]
status, f20_entry = enter(T, CLUB, f20_id, division(v, "u24", "48 kg"),
                          clubName="Beta Club", coachName="Coach B", coachPhone="+966500000002",
                          declaredWeightKg=47.5, heightCm=160)
assert status == 200, f20_entry
v = form(T, F17)[1]
status, f17_entry = enter(T, F17, f17_id, division(v, "u18", "45 kg"), clubName="alpha club",
                          declaredWeightKg=44, heightCm=158)
assert status == 200, f17_entry
v = form(T, M15)[1]
status, m15_entry = enter(T, M15, m15_id, division(v, "u16", "48 kg"), clubName="Gamma Center",
                          declaredWeightKg=47, heightCm=165)
assert status == 200, m15_entry
v = form(T, W)[1]
status, w_entry = enter(T, W, w_id, division(v, "u24", "54 kg"), clubName="Delta Club")
assert status == 200, w_entry
call("POST", "/api/admin/tournaments/entries/%d/withdraw" % w_entry["id"], {"reason": "test"}, token=ADMIN)

say("")
say("=== listing, grouping and order ===")
status, listing = participants()
check("the page loads for an administrator", status == 200, status)
rows = listing["participants"]
check("a withdrawn athlete is no longer registered: four participants", len(rows) == 4, len(rows))
headings = []
for p in rows:
    if not headings or headings[-1] != p["division"]["heading"]:
        headings.append(p["division"]["heading"])
check("divisions in order: Female before Male, categories official, weights ascending",
      headings == ["Female / U18 / 45 KG", "Female / U24 / 48 KG", "Male / U16 / 48 KG", "Male / U24 / 54 KG"],
      headings)
check("only divisions with athletes appear (no empty Elite or 51 kg groups)",
      not any("Elite" in h or "51 KG" in h for h in headings), headings)
check("distinct clubs, case-insensitively: Alpha, Beta, Gamma",
      len({(p["club"] or "").lower() for p in rows if p["club"]}) == 3, [p["club"] for p in rows])

m20 = by_athlete(listing, m20_id)
check("the snapshot comes from the entry: club, coach, mobile, weight, height",
      (m20["club"], m20["coachName"], m20["coachPhone"], float(m20["declaredWeightKg"]), float(m20["heightCm"]))
      == ("Alpha Club", "Coach A", "+966500000001", 53.4, 176.0), m20)
check("member ID, registration date and who registered",
      m20["membershipNumber"] and m20["registeredAt"] and m20["registeredBy"].startswith("Athlete"), m20)
f20 = by_athlete(listing, f20_id)
check("an entry made by the club says so", f20["registeredBy"].startswith("Club"), f20["registeredBy"])
check("no Gender / Category / Weight needed in the row: the group carries them",
      f20["division"]["gender"] == "female" and f20["division"]["category"] == "u24", f20["division"])

say("")
say("=== requirements at the tournament's competition age ===")
keys = lambda p: [r["key"] for r in p["requirements"]]
f17 = by_athlete(listing, f17_id)
m15 = by_athlete(listing, m15_id)
check("competition age is the tournament year minus the birth year",
      (m20["competitionAge"], f17["competitionAge"], m15["competitionAge"]) == (20, 17, 15),
      (m20["competitionAge"], f17["competitionAge"], m15["competitionAge"]))
check("HIV applies above 15: yes at 17 and 20", "screening" in keys(f17) and "screening" in keys(m20))
check("HIV does not apply at 15", "screening" not in keys(m15), keys(m15))
check("under 18: guardian consent, no adult declarations", "guardian_consent" in keys(m15)
      and m15["declarations"] is None and f17["declarations"] is None)
check("a girl under 18 also owes the signed non-pregnancy declaration",
      "pregnancy_declaration" in keys(f17) and "pregnancy_declaration" not in keys(m15), keys(f17))
check("adults: no guardian consent; declarations counted",
      "guardian_consent" not in keys(m20) and m20["declarations"]["total"] > 0, m20["declarations"])
check("an adult woman owes the non-pregnancy declaration, a man does not",
      "pregnancy" in keys(f20) and "pregnancy" not in keys(m20), (keys(f20), keys(m20)))
check("health questions counted out of eight", m20["healthQuestions"]["total"] == 8, m20["healthQuestions"])
check("nothing on file: all four are incomplete", all(not p["requirementsComplete"] for p in rows))

questions = [q["key"] for q in form(T, M20)[1]["medical"]["questions"]]
declarations = [d["key"] for d in form(T, M20)[1]["medical"]["declarations"]]
for rid in (m20_id, m15_id):
    sql("update AthleteMedicalFiles set CertificateAttachmentId='qa', ScreeningAttachmentId='qa', "
        "HealthAnswersJson=?, DeclarationsJson=?, GuardianConsentAttachmentId=? where AthleteRegistrationId=?",
        (json.dumps({k: False for k in questions}), json.dumps({k: True for k in declarations}),
         "qa" if rid == m15_id else None, rid))
listing = participants()[1]
m20, m15 = by_athlete(listing, m20_id), by_athlete(listing, m15_id)
check("a complete adult file reads Complete", m20["requirementsComplete"] and m20["missing"] == [], m20["missing"])
check("a complete under-16 file reads Complete without HIV", m15["requirementsComplete"], m15["missing"])
check("Incomplete is tracking only: entries keep their status",
      all(p["status"] == "registered" for p in listing["participants"]), [p["status"] for p in listing["participants"]])

say("")
say("=== edit options ===")
opts = {o["value"]: [c["label"] for c in o["weightClasses"]] for o in m20["editOptions"]}
check("a 20-year-old man: U24 and Elite, each with the tournament's male classes only",
      opts == {"u24": ["51 kg", "54 kg"], "elite": ["54 kg", "57 kg"]}, opts)
opts = {o["value"]: [c["label"] for c in o["weightClasses"]] for o in by_athlete(listing, f17_id)["editOptions"]}
check("a 17-year-old girl: U18 only (no Elite under 18), female classes", opts == {"u18": ["45 kg", "48 kg"]}, opts)

say("")
say("=== the edit ===")
divs = call("GET", "/api/admin/tournaments/%d" % T, token=ADMIN)[1]["divisions"]
div = lambda cat, g, kg: next(d["id"] for d in divs if d["category"] == cat and d["gender"] == g
                              and d["weightLimitKg"] is not None and float(d["weightLimitKg"]) == kg)
other_div = call("GET", "/api/admin/tournaments/%d" % OTHER, token=ADMIN)[1]["divisions"][0]["id"]
before_payload = sql("select PayloadJson from Registrations where Id=?", (m20_id,))[0][0]

for name, cat, did in [
    ("a category the athlete's age does not admit (U16 at 20)", "u16", div("u16", "male", 48)),
    ("a female class for a man", "elite", div("elite", "female", 54)),
    ("a class from another category", "u24", div("elite", "male", 57)),
    ("a class from another tournament", "elite", other_div),
    ("no weight class", "elite", None),
    ("an unknown category", "open", div("elite", "male", 57)),
]:
    status, refused = change(m20["id"], cat, did)
    check("refused: " + name, status == 400, (status, refused))
row = sql("select Category, DivisionId from TournamentEntries where Id=?", (m20["id"],))[0]
check("and the entry is unchanged by the refusals", row == ("u24", div("u24", "male", 54)), row)

status, refused = change(m20["id"], "elite", div("elite", "male", 57), reason=None)
check("a valid change without a reason is refused (every move needs one)", status == 400 and "reason" in refused.get("messageEn", ""), (status, refused))
status, changed = change(m20["id"], "elite", div("elite", "male", 57))
check("a valid change is accepted", status == 200, changed)
row = sql("select Category, DivisionId, Track, DeclaredWeightKg, ClubName from TournamentEntries where Id=?", (m20["id"],))[0]
check("the entry now reads Elite / 57 kg, track elite, snapshot kept",
      row[:3] == ("elite", div("elite", "male", 57), "elite") and float(row[3]) == 53.4 and row[4] == "Alpha Club", row)
check("the athlete's profile is not modified",
      sql("select PayloadJson from Registrations where Id=?", (m20_id,))[0][0] == before_payload)
check("other entries are untouched",
      sql("select Category from TournamentEntries where Id=?", (m15["id"],))[0][0] == "u16")
audit = sql("select ActorName, Action, EntityType, EntityId, EntityRef, FromStatus, ToStatus, Details, CreatedAt "
            "from AuditLog where EntityType='tournament_entry' and EntityId=? order by Id desc limit 1", (m20["id"],))
a = audit[0] if audit else None
check("audited: actor, entry, athlete, previous and new category and weight, time",
      a is not None and a[0] == "admin" and a[1] == "tournament.entry_updated"
      and a[5] == "U24 / 54 kg" and a[6] == "Elite / 57 kg" and ("athlete #%d" % m20_id) in a[7] and a[8], a)
heads = [p["division"]["heading"] for p in participants()[1]["participants"]]
check("the athlete now appears under Male / Elite / 57 KG", "Male / Elite / 57 KG" in heads, heads)
count = sql("select count(*) from AuditLog where EntityType='tournament_entry' and EntityId=?", (m20["id"],))[0][0]
status, _ = change(m20["id"], "elite", div("elite", "male", 57))
check("saving the same values again changes and audits nothing",
      status == 200 and sql("select count(*) from AuditLog where EntityType='tournament_entry' and EntityId=?",
                            (m20["id"],))[0][0] == count)
status, _ = change(w_entry["id"], "u24", div("u24", "male", 51))
check("a withdrawn entry cannot be changed", status == 409, status)

say("")
say("=== export ===")
status, csv = call("GET", "/api/admin/tournaments/%d/participants/export" % T, token=ADMIN)
text = csv.decode("utf-8") if isinstance(csv, bytes) else ""
check("CSV with a BOM and the page's columns",
      status == 200 and text.startswith("﻿") and "Requirements status" in text.splitlines()[0], text[:120])
check("one row per participant", len(text.strip().splitlines()) == 1 + 4, len(text.strip().splitlines()))
check("the export is audited",
      sql("select count(*) from AuditLog where Action='registration.exported' and EntityType='tournament' and EntityId=?",
          (T,))[0][0] == 1)

say("")
say("=== authorisation ===")
SCHEDULE = account_with(["tournament.schedule"])
DRAW = account_with(["tournament.draw"])
ENTRIES = account_with(["tournament.entries"])
check("schedule-only cannot list", participants(token=SCHEDULE)[0] == 403)
check("schedule-only cannot export",
      call("GET", "/api/admin/tournaments/%d/participants/export" % T, token=SCHEDULE)[0] == 403)
check("draw may list", participants(token=DRAW)[0] == 200)
check("draw may not edit", change(m20["id"], "u24", div("u24", "male", 51), token=DRAW)[0] == 403)
check("entries may edit", change(m20["id"], "u24", div("u24", "male", 51), token=ENTRIES)[0] == 200)
check("a member token is refused", participants(token=M20)[0] in (401, 403))
check("no token is refused", participants(token=None)[0] == 401)
check("member token cannot edit", change(m20["id"], "elite", div("elite", "male", 54), token=M20)[0] in (401, 403))

say("")
say("=== medical documents from Participants ===")
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082")


def admin_upload(entry_id, slot, date=None, name="doc.png", content=PNG, token=ADMIN):
    boundary = "----smf" + uuid.uuid4().hex
    parts = b""
    if date is not None:
        parts += ("--%s\r\nContent-Disposition: form-data; name=\"date\"\r\n\r\n%s\r\n" % (boundary, date)).encode()
    parts += (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\n"
               "Content-Type: application/octet-stream\r\n\r\n" % (boundary, name)).encode() + content
              + ("\r\n--%s--\r\n" % boundary).encode())
    head = {"Content-Type": "multipart/form-data; boundary=" + boundary}
    if token:
        head["Authorization"] = "Bearer " + token
    request = urllib.request.Request(
        API + "/api/admin/tournaments/entries/%d/medical/documents/%s" % (entry_id, slot),
        data=parts, method="POST", headers=head)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        text = error.read().decode()
        try:
            return error.code, json.loads(text)
        except ValueError:
            return error.code, text


def medical_row(rid):
    return sql("select CertificateAttachmentId, CertificateDate, ScreeningAttachmentId, GuardianConsentAttachmentId, "
               "PregnancyDeclarationAttachmentId, PendingChangeJson, DocumentApprovalsJson "
               "from AthleteMedicalFiles where AthleteRegistrationId=?", (rid,))[0]


def doc_of(medical, key):
    return next((d for d in medical["documents"] if d["key"] == key), None)


def athlete_docs(token):
    return {d["key"]: d for d in requirements(token)[1]["tournaments"][0]["documents"]}


TECH = account_with(["tournament.technical"])
listing = participants()[1]
F20E = by_athlete(listing, f20_id)["id"]
F17E = by_athlete(listing, f17_id)["id"]
M15E = by_athlete(listing, m15_id)["id"]
M20E = by_athlete(listing, m20_id)["id"]
yesterday = (TODAY - datetime.timedelta(days=1)).isoformat()
tomorrow = (TODAY + datetime.timedelta(days=1)).isoformat()

# --- who may ---
for name, token in (("draw", DRAW), ("entries", ENTRIES), ("schedule", SCHEDULE)):
    check("%s-only cannot read the medical file" % name,
          call("GET", "/api/admin/tournaments/entries/%d/medical" % F20E, token=token)[0] == 403)
    check("%s-only cannot upload" % name, admin_upload(F20E, "certificate", yesterday, token=token)[0] == 403)
check("a member token cannot upload", admin_upload(F20E, "certificate", yesterday, token=F20)[0] in (401, 403))
status, med = call("GET", "/api/admin/tournaments/entries/%d/medical" % F20E, token=TECH)
check("the technical team reads the medical file", status == 200, status)
check("adult woman: certificate and HIV only as documents; electronic pregnancy declaration separate",
      [d["key"] for d in med["documents"]] == ["certificate", "screening"]
      and med["electronicPregnancyDeclaration"] == {"done": False}, (med["documents"], med["electronicPregnancyDeclaration"]))
check("questions with answers, and adult declarations", len(med["questions"]) == 8 and len(med["declarations"]) == 4)
m15med = call("GET", "/api/admin/tournaments/entries/%d/medical" % M15E, token=TECH)[1]
check("15-year-old: no HIV document; guardian consent; no declarations",
      [d["key"] for d in m15med["documents"]] == ["certificate", "guardian_consent"] and m15med["declarations"] is None,
      [d["key"] for d in m15med["documents"]])
f17med = call("GET", "/api/admin/tournaments/entries/%d/medical" % F17E, token=TECH)[1]
check("17-year-old girl: certificate, HIV, guardian consent and the separate signed pregnancy declaration",
      [d["key"] for d in f17med["documents"]] == ["certificate", "screening", "guardian_consent", "pregnancy_declaration"]
      and f17med["electronicPregnancyDeclaration"] is None, [d["key"] for d in f17med["documents"]])

# --- validation ---
before = medical_row(f20_id)
for label, args in [
    ("a dated document without a date", (F20E, "certificate", None)),
    ("a date in the future", (F20E, "certificate", tomorrow)),
    ("an unsupported file type", (F20E, "certificate", yesterday, "notes.txt", b"hello")),
    ("an empty file", (F20E, "certificate", yesterday, "empty.png", b"")),
    ("HIV for a 15-year-old", (M15E, "screening", yesterday)),
    ("guardian consent for an adult", (F20E, "guardian_consent", None)),
    ("a signed pregnancy declaration for a boy", (M15E, "pregnancy_declaration", None)),
    ("an unknown slot", (F20E, "passport", None)),
]:
    st, body_ = admin_upload(*args, token=TECH)
    check("refused: " + label, st == 400, (st, body_))
check("and none of the refusals touched the medical file", medical_row(f20_id) == before)
check("an upload for a missing entry is 404", admin_upload(999999, "certificate", yesterday, token=TECH)[0] == 404)

# --- upload a missing document ---
kpi_before = sum(1 for p in participants()[1]["participants"] if not p["requirementsComplete"])
st, up = admin_upload(F20E, "certificate", yesterday, name="f20-cert.png", token=TECH)
check("upload a missing certificate", st == 200 and up["replaced"] is False, (st, up))
row = medical_row(f20_id)
check("stored on the athlete's own Medical File, with its date", row[0] and row[1] and row[1].startswith(yesterday), row[:2])
cert = doc_of(up["medical"], "certificate")
check("approved immediately, by the uploading user", cert["status"] == "approved" and cert["approvedBy"].startswith("p"),
      cert)
check("the approval is recorded on the file", "certificate" in json.loads(row[6]), row[6])
a = sql("select Action, EntityRef, FromStatus, ToStatus, Details from AuditLog where Action like 'athlete.medical_document%' "
        "order by Id desc limit 1")[0]
check("audited: uploaded, slot, new attachment, entry, approved immediately",
      a[0] == "athlete.medical_document_uploaded" and a[1] == "certificate" and a[2] is None and a[3] == row[0]
      and ("entry #%d" % F20E) in a[4] and "Approved immediately" in a[4], a)
check("the audit text holds references, not file contents", "PNG" not in a[4] and len(a[4]) < 600)

docs = athlete_docs(F20)
check("the athlete's Medical File shows it as approved, with the date",
      docs["certificate"]["status"] == "approved" and docs["certificate"]["date"].startswith(yesterday), docs["certificate"])
st, raw = call("GET", "/api/member/me/medical/documents/certificate", token=F20)
check("the athlete opens the same document", st == 200 and raw == PNG, st)
st, raw = call("GET", "/api/admin/tournaments/entries/%d/medical/documents/certificate" % F20E, token=TECH)
check("the technical team opens it from Participants", st == 200 and raw == PNG, st)
check("opening is audited",
      sql("select count(*) from AuditLog where Action='athlete.medical_document_viewed' and EntityRef='certificate'")[0][0] >= 1)
check("an inapplicable slot cannot be opened (HIV for the 15-year-old)",
      call("GET", "/api/admin/tournaments/entries/%d/medical/documents/screening" % M15E, token=TECH)[0] == 404)
check("a missing document cannot be opened",
      call("GET", "/api/admin/tournaments/entries/%d/medical/documents/screening" % F20E, token=TECH)[0] == 404)
check("the draw role cannot open it",
      call("GET", "/api/admin/tournaments/entries/%d/medical/documents/certificate" % F20E, token=DRAW)[0] == 403)

# --- an athlete's replacement still waits ---
st, stored = upload("/api/member/me/medical/attachments", F20, "athlete-new-cert.png")
call("PUT", "/api/member/me/medical", {"certificateAttachmentId": stored["id"], "certificateDate": yesterday}, token=F20)
row = medical_row(f20_id)
check("an athlete's replacement is held pending; the approved document stays in use",
      row[0] != stored["id"] and row[5] and stored["id"] in row[5], row)
docs = athlete_docs(F20)
check("the athlete sees approved + replacement awaiting approval",
      docs["certificate"]["status"] == "approved" and docs["certificate"]["replacementPending"] is True, docs["certificate"])
med = call("GET", "/api/admin/tournaments/entries/%d/medical" % F20E, token=TECH)[1]
check("Participants shows the pending replacement", doc_of(med, "certificate")["replacementPending"] is True)

# --- admin replaces while it waits: the older pending one is withdrawn ---
previous = medical_row(f20_id)[0]
st, up = admin_upload(F20E, "certificate", yesterday, name="f20-cert-2.png", token=TECH)
check("admin replaces: approved, and the pending replacement withdrawn",
      st == 200 and up["replaced"] is True and up["supersededPendingReplacement"] is True, (st, up))
row = medical_row(f20_id)
check("the new document is in use and nothing is pending", row[0] not in (previous, stored["id"]) and row[5] is None, row)
check("so the older replacement can no longer be approved over it",
      call("POST", "/api/admin/athletes/%d/medical/approve" % f20_id, token=ADMIN)[0] == 409)
a = sql("select Action, FromStatus, ToStatus, Details from AuditLog where Action like 'athlete.medical_document%' "
        "and EntityRef='certificate' and Action != 'athlete.medical_document_viewed' order by Id desc limit 1")[0]
check("audited as a replacement, with previous and new references and the withdrawn one",
      a[0] == "athlete.medical_document_replaced" and a[1] == previous and a[2] == row[0] and stored["id"] in a[3], a)

# --- a pending replacement of the *other* document is left alone ---
st, s1 = upload("/api/member/me/medical/attachments", F20, "scr-1.png")
call("PUT", "/api/member/me/medical", {"screeningAttachmentId": s1["id"], "screeningDate": yesterday}, token=F20)
check("the athlete's first HIV upload applies at once, unapproved",
      athlete_docs(F20)["screening"]["status"] == "uploaded" and medical_row(f20_id)[2] == s1["id"])
st, c2 = upload("/api/member/me/medical/attachments", F20, "cert-3.png")
st, s2 = upload("/api/member/me/medical/attachments", F20, "scr-2.png")
call("PUT", "/api/member/me/medical", {"certificateAttachmentId": c2["id"], "certificateDate": yesterday,
                                       "screeningAttachmentId": s2["id"], "screeningDate": yesterday}, token=F20)
pending = json.loads(medical_row(f20_id)[5])
check("both replacements held", pending.get("certificateAttachmentId") == c2["id"]
      and pending.get("screeningAttachmentId") == s2["id"], pending)
st, up = admin_upload(F20E, "screening", yesterday, name="scr-admin.png", token=TECH)
pending = json.loads(medical_row(f20_id)[5])
check("admin replaces the HIV test: its pending half goes, the certificate's stays",
      st == 200 and up["supersededPendingReplacement"] and pending.get("screeningAttachmentId") is None
      and pending.get("certificateAttachmentId") == c2["id"], pending)
st, _ = call("POST", "/api/admin/athletes/%d/medical/approve" % f20_id, token=ADMIN)
row = medical_row(f20_id)
check("approving the remaining (newer) athlete replacement still works and applies only the certificate",
      st == 200 and row[0] == c2["id"] and row[2] != s2["id"] and row[5] is None, row)
docs = athlete_docs(F20)
check("both now read approved for the athlete",
      docs["certificate"]["status"] == "approved" and docs["screening"]["status"] == "approved", docs)

# --- minors: the two signed documents stay separate ---
st, up = admin_upload(F17E, "guardian_consent", token=TECH)
row = medical_row(f17_id)
check("guardian consent for a 17-year-old girl, no date needed", st == 200 and row[3] and row[4] is None, row)
check("the pregnancy declaration is still missing on its own",
      doc_of(up["medical"], "pregnancy_declaration")["status"] == "missing"
      and doc_of(up["medical"], "guardian_consent")["status"] == "approved")
st, up = admin_upload(F17E, "pregnancy_declaration", name="preg.pdf", content=b"%PDF-1.4\n%%EOF\n", token=TECH)
row = medical_row(f17_id)
check("then the signed pregnancy declaration, as its own attachment", st == 200 and row[4] and row[4] != row[3], row)

# --- statuses, KPI ---
for slot in ("certificate", "screening"):
    admin_upload(F17E, slot, yesterday, token=TECH)
sql("update AthleteMedicalFiles set HealthAnswersJson=? where AthleteRegistrationId=?",
    (json.dumps({k: False for k in questions}), f17_id))
listing = participants()[1]
f17 = by_athlete(listing, f17_id)
check("with everything applicable on file, the girl reads Complete", f17["requirementsComplete"], f17["missing"])
check("and the list's items carry the approved state",
      all(r["status"] == "approved" for r in f17["requirements"]), f17["requirements"])
kpi_after = sum(1 for p in listing["participants"] if not p["requirementsComplete"])
check("the Incomplete KPI went down by one", kpi_after == kpi_before - 1, (kpi_before, kpi_after))
check("approval is not clearance: the entry's medical result is untouched",
      sql("select MedicalResult, Status from TournamentEntries where Id=?", (F17E,))[0] == (None, "registered"))

# --- withdrawn entries are closed to it ---
check("no upload through a withdrawn entry", admin_upload(w_entry["id"], "certificate", yesterday, token=TECH)[0] == 409)

say("")
if failures:
    say("FAILED: %d" % len(failures))
    for name in failures:
        say("  - " + name)
    sys.exit(1)
say("ALL PASSED")
