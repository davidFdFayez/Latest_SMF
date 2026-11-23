"""
REQ-03 — registering an athlete in a tournament from a member account — and
the medical part of REQ-04 that belongs to the athlete alone.

Who may register whom, what the server decides (eligibility, the division)
and what it refuses to take from the request, the registration details kept
with the entry rather than written into the profile, the medical section only
the athlete may fill in, and the Medical File their tournaments then produce.
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


T = tournament(["u16", "u18", "u24", "elite"], ["male", "female"], {
    "u16:male": [48, 51], "u18:male": [51, 54], "u24:male": [51, 54, 57],
    "elite:male": [54, 57, 60], "elite:female": [54, 57],
})
CLUB_ID, CLUB = club()

say("")
say("=== the athlete registers themselves ===")

a18_id, a18_email, A18 = athlete(18)
status, view = form(T, A18)
check("the registration form opens for the athlete themselves", status == 200, view)
check("eligibility worked out on the server: 18 → U24 and Elite, both offered",
      [c["category"] for c in view["eligibility"]["eligibleCategories"]] == ["u24", "elite"],
      view["eligibility"]["eligibleCategories"])
check("the details start from their approved record",
      view["prefill"] == {"clubName": "مركز الحربي", "coachName": "مدرب الحربي", "coachPhone": "+966512340009",
                          "currentWeight": "50", "height": "170"}, view["prefill"])
check("and the medical section is theirs to fill in, with the eight questions",
      view["medical"] is not None and len(view["medical"]["questions"]) == 8
      and view["medical"]["screeningApplies"] is True and view["medical"]["declarationsApply"] is True,
      view.get("medical"))

spoof = form(T, A18, a18_id)[1]
check("naming an athlete id changes nothing for an athlete (it is always themselves)",
      spoof["athlete"]["registrationId"] == a18_id)

status, missing = enter(T, A18, a18_id, None)
check("a weight class has to be chosen: no division, no entry", status == 400, missing)

u24_54 = division(view, "u24", "54 kg")
status, entered = enter(T, A18, a18_id, u24_54,
                        clubName="مركز آخر", coachName="مدرب آخر", coachPhone="+966500000000",
                        declaredWeightKg=51, heightCm=171,
                        dateOfBirth="1990-01-01", gender="female",
                        medical={"healthAnswers": {"ko_6_months": False, "wada_positive": False, "medication_now": True},
                                 "medications": "Vitamin D",
                                 "declarations": {"participation": True, "media": True}})
check("they register, with only part of the medical section filled in", status == 200, entered)
entry_row = sql("select Category, DivisionId, ClubName, CoachName, CoachPhone, DeclaredWeightKg, HeightCm, EnteredBy, Status "
                "from TournamentEntries where Id=?", (entered["id"],))[0]
check("registered at once, in the chosen division, by the athlete",
      entry_row[0] == "u24" and entry_row[1] == u24_54 and entry_row[7] == "athlete" and entry_row[8] == "registered", entry_row)
check("the registration keeps what was entered for it",
      entry_row[2:5] == ("مركز آخر", "مدرب آخر", "+966500000000")
      and float(entry_row[5]) == 51 and float(entry_row[6]) == 171, entry_row[2:7])
profile = call("GET", "/api/member/me/profile", token=A18)[1]
check("and the athlete's profile is untouched: still 50 kg, 170 cm, their own club and coach",
      profile["fields"]["currentWeight"] == "50" and profile["fields"]["height"] == "170"
      and profile["fields"]["clubName"] == "مركز الحربي" and profile["fields"]["coachName"] == "مدرب الحربي"
      and profile["pending"] is None, profile["fields"])
check("nothing was sent for approval either",
      sql("select count(*) from MemberProfileChanges where RegistrationId=?", (a18_id,))[0][0] == 0)

status, again = enter(T, A18, a18_id, division(view, "elite", "57 kg"))
check("one registration per tournament: a second, in another category, is refused", status == 409, again)
check("the form now shows the registration they hold",
      form(T, A18)[1]["eligibility"]["existingEntry"]["category"] == "u24")

say("")
say("=== the Medical File their registration produces ===")

status, req = requirements(A18)
check("the Medical File lists the tournament", status == 200 and [t["tournamentId"] for t in req["tournaments"]] == [T], req)
docs = {d["key"]: d for d in req["tournaments"][0]["documents"]}
check("with both documents, missing (an 18-year-old needs the screening too)",
      set(docs) == {"certificate", "screening"} and all(d["status"] == "missing" for d in docs.values()), docs)
check("answered questions do not come back; the five left blank do",
      [q["key"] for q in req["questions"]] == ["surgery_6_months", "hospital_6_months", "fracture_6_months",
                                                "glasses_or_lenses", "spine_surgery"], [q["key"] for q in req["questions"]])
check("the two declarations not yet accepted are outstanding",
      [d["key"] for d in req["declarations"]] == ["anti_doping", "data_accuracy"], req["declarations"])
check("the medication named with a yes was kept",
      call("GET", "/api/member/me/medical", token=A18)[1]["medications"] == "Vitamin D")

status, _ = call("PUT", "/api/member/me/medical", {"healthAnswers": {"surgery_6_months": False, "glasses_or_lenses": True}}, token=A18)
req = requirements(A18)[1]
check("answering two more from the Medical File leaves three",
      status == 200 and [q["key"] for q in req["questions"]] == ["hospital_6_months", "fracture_6_months", "spine_surgery"])
answers = call("GET", "/api/member/me/medical", token=A18)[1]["questions"]
check("and the answers given at registration are still there",
      {q["key"]: q["answer"] for q in answers}["ko_6_months"] is False
      and {q["key"]: q["answer"] for q in answers}["medication_now"] is True)

status, stored = upload("/api/member/me/medical/attachments", A18)
check("the athlete uploads a document", status == 200 and stored.get("id"), stored)
call("PUT", "/api/member/me/medical",
     {"certificateAttachmentId": stored["id"], "certificateDate": TODAY.isoformat()}, token=A18)
docs = {d["key"]: d for d in requirements(A18)[1]["tournaments"][0]["documents"]}
check("an uploaded document stays listed, as uploaded — not as approved",
      docs["certificate"]["status"] == "uploaded" and docs["certificate"]["date"].startswith(TODAY.isoformat())
      and docs["screening"]["status"] == "missing", docs)
status, served = call("GET", "/api/member/me/medical/documents/certificate", token=A18)
check("they can open it", status == 200 and served[:4] == b"\x89PNG", served[:8])

_, replacement = upload("/api/member/me/medical/attachments", A18, "new.png")
call("PUT", "/api/member/me/medical", {"certificateAttachmentId": replacement["id"]}, token=A18)
docs = {d["key"]: d for d in requirements(A18)[1]["tournaments"][0]["documents"]}
check("replacing it waits for approval: still uploaded, marked pending",
      docs["certificate"]["status"] == "uploaded" and docs["certificate"]["replacementPending"] is True, docs["certificate"])
check("and the document in use is still the first one",
      sql("select CertificateAttachmentId from AthleteMedicalFiles where AthleteRegistrationId=?", (a18_id,))[0][0] == stored["id"])
check("the entry is unaffected by the pending document",
      sql("select Status from TournamentEntries where Id=?", (entered["id"],))[0][0] == "registered")

say("")
say("=== a club registers its own athlete ===")

c20_id, c20_email, C20 = athlete(20)
join(CLUB, c20_email, "athlete", C20)
status, club_view = form(T, CLUB, c20_id)
check("the club opens the form for its athlete", status == 200 and club_view["athlete"]["registrationId"] == c20_id, club_view)
check("with no medical section: that part is the athlete's", club_view["medical"] is None)
check("the club's eligibility answer is the athlete's own (20 → U24 + Elite)",
      [c["category"] for c in club_view["eligibility"]["eligibleCategories"]] == ["u24", "elite"])

status, refused = enter(T, CLUB, c20_id, division(club_view, "elite", "57 kg"),
                        medical={"healthAnswers": {"ko_6_months": False}})
check("a club cannot answer the athlete's medical questions", status == 403, refused)
check("and nothing was registered or recorded by that attempt",
      sql("select count(*) from TournamentEntries where TournamentId=? and AthleteRegistrationId=?", (T, c20_id))[0][0] == 0
      and sql("select count(*) from AthleteMedicalFiles where AthleteRegistrationId=? and HealthAnswersJson is not null", (c20_id,))[0][0] == 0)

status, by_club = enter(T, CLUB, c20_id, division(club_view, "elite", "57 kg"), declaredWeightKg=56)
check("the club registers the athlete, with nothing medical, at once", status == 200, by_club)
check("recorded as entered by the club",
      sql("select EnteredBy, Status from TournamentEntries where Id=?", (by_club["id"],))[0] == ("club", "registered"))
notice = next((n for n in notices(C20) if n["type"] == "tournament_entry.created"), None)
check("the athlete is told in their account, by the club's name, and led to their tournaments",
      notice is not None and "نادي الفهد" in notice["bodyAr"] and notice["target"] == "/account/athlete?section=tournaments", notice)
req20 = requirements(C20)[1]
check("and the whole medical part waits in their Medical File",
      len(req20["tournaments"]) == 1 and len(req20["questions"]) == 8 and len(req20["declarations"]) == 4
      and all(d["status"] == "missing" for d in req20["tournaments"][0]["documents"]), req20)

OTHER_CLUB_ID, OTHER_CLUB = club()
o20_id, o20_email, O20 = athlete(21)
join(OTHER_CLUB, o20_email, "athlete", O20)
check("a club cannot open another club's athlete", form(T, CLUB, o20_id)[0] == 403)
other_view = form(T, OTHER_CLUB, o20_id)[1]
status, _ = enter(T, CLUB, o20_id, division(other_view, "elite", "57 kg"))
check("nor register them", status == 403, status)
free_id, free_email, FREE = athlete(22)
check("nor an athlete in no club at all", enter(T, CLUB, free_id, u24_54)[0] == 403)

say("")
say("=== a coach registers their club's athlete ===")

coach_email, COACH = coach()
join(CLUB, coach_email, "coach", COACH)
k19_id, k19_email, K19 = athlete(19)
join(CLUB, k19_email, "athlete", K19)
coach_view = form(T, COACH, k19_id)[1]
status, by_coach = enter(T, COACH, k19_id, division(coach_view, "u24", "51 kg"))
check("the coach registers an athlete of their club", status == 200, by_coach)
coach_notice = next((n for n in notices(K19) if n["type"] == "tournament_entry.created"), None)
check("the athlete is told who registered them", coach_notice is not None and "المدرب" in coach_notice["bodyAr"], coach_notice)
check("and their Medical File fills with what is outstanding", len(requirements(K19)[1]["tournaments"]) == 1)
check("a coach cannot open another club's athlete", form(T, COACH, o20_id)[0] == 403)
check("nor register them", enter(T, COACH, o20_id, division(other_view, "elite", "57 kg"))[0] == 403)
check("nor an athlete in no club", enter(T, COACH, free_id, u24_54)[0] == 403)
check("a coach cannot answer the athlete's medical questions either",
      enter(T, COACH, k19_id, u24_54, medical={"declarations": {"media": True}})[0] == 403)

say("")
say("=== what the server will not take from the request ===")

check("an athlete cannot register another athlete", enter(T, A18, c20_id, u24_54)[0] == 403)
check("nor open another athlete's form: theirs comes back instead", form(T, FREE, a18_id)[1]["athlete"]["registrationId"] == free_id)

f18_id, f18_email, F18 = athlete(18, "female")
f_view = form(T, F18)[1]
check("a woman of 18 is offered only what the tournament runs for women: Elite",
      [c["category"] for c in f_view["eligibility"]["eligibleCategories"]] == ["elite"])
check("a men's division cannot be entered by her, whatever the request says",
      enter(T, F18, f18_id, u24_54, gender="male")[0] == 409)
check("a division outside her age cannot be entered",
      enter(T, F18, f18_id, division(view, "u24", "51 kg"))[0] == 409)
u16_id, u16_email, U16 = athlete(15)
u16_view = form(T, U16)[1]
check("a 15-year-old is offered U16 alone",
      [c["category"] for c in u16_view["eligibility"]["eligibleCategories"]] == ["u16"])
check("and cannot enter an adult division by sending an older birth date",
      enter(T, U16, u16_id, division(view, "elite", "57 kg"), dateOfBirth="1990-01-01")[0] == 409)
check("a division of another tournament is not this tournament's",
      enter(T, F18, f18_id, 999999)[0] == 404)
check("a category contradicting the chosen division is refused",
      enter(T, F18, f18_id, division(f_view, "elite", "54 kg"), category="u24")[0] == 400)

none_id, none_email, NONE = athlete(45)
n_view = form(T, NONE)[1]
check("an athlete with no division in this tournament is told why, and offered nothing",
      n_view["eligibility"]["noEligibleDivision"] is True
      and any(b["code"] == "no_eligible_category" for b in n_view["eligibility"]["barriers"]))

CLOSED = tournament(["elite"], ["male"])
closed_view = form(CLOSED, CLUB, c20_id)[1]
sql("update Tournaments set RegistrationClosesAt='2000-01-01 00:00:00' where Id=?", (CLOSED,))
check("a tournament no longer taking entries refuses registration",
      enter(CLOSED, CLUB, c20_id, closed_view["eligibility"]["eligibleCategories"][0]["divisions"][0]["divisionId"])[0] == 409)
check("and the form says so", form(CLOSED, CLUB, c20_id)[1]["tournament"]["registrationOpen"] is False)

say("")
say("=== medical by age and gender, and privacy ===")

status, _ = enter(T, U16, u16_id, division(u16_view, "u16", "51 kg"))
u16_req = requirements(U16)[1]
u16_docs = [d["key"] for d in u16_req["tournaments"][0]["documents"]]
check("a 15-year-old needs no screening, and a signed guardian consent instead of declarations",
      status == 200 and u16_docs == ["certificate", "guardian_consent"] and u16_req["declarations"] == [], u16_req)
status, _ = enter(T, F18, f18_id, division(f_view, "elite", "54 kg"))
check("a woman of 18 has the non-pregnancy declaration outstanding",
      status == 200 and requirements(F18)[1]["pregnancyDeclarationOutstanding"] is True)
check("an athlete entered in nothing has no requirements: the calm empty state",
      requirements(NONE)[1]["tournaments"] == [] and requirements(NONE)[1]["questions"] == [])
check("a club cannot read an athlete's Medical File", requirements(CLUB)[0] == 403)
check("nor a coach", requirements(COACH)[0] == 403)
check("nor the medical file itself", call("GET", "/api/member/me/medical", token=CLUB)[0] == 403)
check("nor a medical document", call("GET", "/api/member/me/medical/documents/certificate", token=COACH)[0] == 403)
check("a club cannot upload into a medical file", upload("/api/member/me/medical/attachments", CLUB)[0] == 403)
check("one athlete's requirements never include another's tournaments",
      [t["tournamentId"] for t in requirements(F18)[1]["tournaments"]] == [T]
      and requirements(F18)[1]["questions"] != requirements(A18)[1]["questions"])

say("")
say("=== the profile weight neither decides eligibility nor picks the weight class ===")

heavy_id, heavy_email, HEAVY = athlete(19, currentWeight="120")
heavy_view = form(T, HEAVY)[1]
check("an athlete whose profile weight is far above every class here is still eligible",
      heavy_view["eligibility"]["canEnter"] is True
      and [c["category"] for c in heavy_view["eligibility"]["eligibleCategories"]] == ["u24", "elite"],
      heavy_view["eligibility"]["eligibleCategories"])
check("and offered every class the tournament runs for them, none chosen for them",
      [d["labelEn"].split(" – ")[-1] for d in heavy_view["eligibility"]["eligibleCategories"][0]["divisions"]]
      == ["51 kg", "54 kg", "57 kg"] and heavy_view["prefill"]["currentWeight"] == "120")
status, light = enter(T, HEAVY, heavy_id, division(heavy_view, "u24", "51 kg"), declaredWeightKg=120)
check("they register in the class they chose; the weight is checked at the weigh-in, not here",
      status == 200 and sql("select DivisionId from TournamentEntries where Id=?", (light["id"],))[0][0]
      == division(heavy_view, "u24", "51 kg"), light)

say("")
say("=== REQ-04 visibility by age and gender, and the two separate minor documents ===")

MATRIX_T = tournament(["u16", "u18", "u24", "elite"], ["male", "female"])
EXPECTED_MEDICAL = {
    # age: (screening, guardian, pregnancy document, adult declarations)
    # The HIV / HBV / HCV test is for ages above 15: 14 and 15 do not see it, 16 does.
    14: (False, True, None, False),
    15: (False, True, None, False),
    16: (True, True, None, False),
    17: (True, True, None, False),
    18: (True, False, False, True),
}
matrix_people = {}
for age in (14, 15, 16, 17, 18):
    for gender in ("male", "female"):
        rid, email, token = athlete(age, gender)
        matrix_people[(age, gender)] = (rid, token)
        med = form(MATRIX_T, token)[1]["medical"]
        screening, guardian, _, adult = EXPECTED_MEDICAL[age]
        pregnancy_document = age < 18 and gender == "female"
        pregnancy_electronic = age >= 18 and gender == "female"
        check("%s %d: the medical section matches the matrix" % (gender, age),
              med["competitionAge"] == age
              and len(med["questions"]) == 8
              and med["screeningApplies"] is screening
              and med["guardianConsentApplies"] is guardian
              and med["pregnancyDocumentApplies"] is pregnancy_document
              and med["declarationsApply"] is adult
              and med["pregnancyDeclarationApplies"] is pregnancy_electronic,
              {k: med[k] for k in ("competitionAge", "screeningApplies", "guardianConsentApplies",
                                   "pregnancyDocumentApplies", "declarationsApply", "pregnancyDeclarationApplies")})

        view_m = form(MATRIX_T, token)[1]
        first = view_m["eligibility"]["eligibleCategories"][0]
        status, _ = enter(MATRIX_T, token, rid, first["divisions"][0]["divisionId"])
        req_m = requirements(token)[1]
        group = next(t for t in req_m["tournaments"] if t["tournamentId"] == MATRIX_T)
        keys = [d["key"] for d in group["documents"]]
        expected_keys = ["certificate"] + (["screening"] if screening else []) \
            + (["guardian_consent"] if guardian else []) + (["pregnancy_declaration"] if pregnancy_document else [])
        check("%s %d: registered with nothing medical, and the Medical File lists %s" % (gender, age, ", ".join(expected_keys)),
              status == 200 and keys == expected_keys, keys)
        check("%s %d: declarations outstanding only for adults; the electronic pregnancy one only for adult women" % (gender, age),
              (len(req_m["declarations"]) == 4) is adult and req_m["pregnancyDeclarationOutstanding"] is pregnancy_electronic,
              (len(req_m["declarations"]), req_m["pregnancyDeclarationOutstanding"]))

girl_id, GIRL = matrix_people[(16, "female")]
boy_id, BOY = matrix_people[(16, "male")]
woman_id, WOMAN = matrix_people[(18, "female")]

status, guardian_html = call("GET", "/api/member/me/medical/guardian-consent", token=GIRL)
check("the guardian consent form no longer carries the non-pregnancy clause",
      status == 200 and "موافقة ولي الأمر" in guardian_html.decode() and "عدم الحمل" not in guardian_html.decode())
status, pregnancy_html = call("GET", "/api/member/me/medical/pregnancy-declaration", token=GIRL)
check("the non-pregnancy declaration is its own form",
      status == 200 and "إقرار عدم الحمل" in pregnancy_html.decode() and "المشاركة:" not in pregnancy_html.decode())
check("a boy under 18 has no non-pregnancy form", call("GET", "/api/member/me/medical/pregnancy-declaration", token=BOY)[0] == 409)
check("a woman of 18 has no guardian form", call("GET", "/api/member/me/medical/guardian-consent", token=WOMAN)[0] == 409)
check("nor a non-pregnancy document form: hers is the electronic declaration",
      call("GET", "/api/member/me/medical/pregnancy-declaration", token=WOMAN)[0] == 409)
check("the forms are the athlete's alone", call("GET", "/api/member/me/medical/pregnancy-declaration", token=CLUB)[0] == 403)


def missing_en(registration_id):
    return [m["en"] for m in call("GET", "/api/admin/athletes/%d/medical" % registration_id, token=ADMIN)[1]["missing"]]


check("for a girl under 18, both signed documents are missing, separately",
      "Signed guardian consent" in missing_en(girl_id) and "Signed non-pregnancy declaration" in missing_en(girl_id),
      missing_en(girl_id))
check("for a boy under 18, only the guardian consent", "Signed non-pregnancy declaration" not in missing_en(boy_id)
      and "Signed guardian consent" in missing_en(boy_id))

# A guardian consent on its own — as any uploaded before the split — counts as
# the guardian consent and nothing more.
_, consent = upload("/api/member/me/medical/attachments", GIRL, "consent.png")
call("PUT", "/api/member/me/medical", {"guardianConsentAttachmentId": consent["id"]}, token=GIRL)
docs_g = {d["key"]: d["status"] for d in next(t for t in requirements(GIRL)[1]["tournaments"])["documents"]}
check("the guardian consent alone completes the guardian consent only",
      docs_g["guardian_consent"] == "uploaded" and docs_g["pregnancy_declaration"] == "missing", docs_g)
check("and the non-pregnancy declaration is still missing for the examination desk",
      "Signed guardian consent" not in missing_en(girl_id) and "Signed non-pregnancy declaration" in missing_en(girl_id))
_, declaration = upload("/api/member/me/medical/attachments", GIRL, "declaration.png")
call("PUT", "/api/member/me/medical", {"pregnancyDeclarationAttachmentId": declaration["id"]}, token=GIRL)
docs_g = {d["key"]: d["status"] for d in next(t for t in requirements(GIRL)[1]["tournaments"])["documents"]}
check("uploading the declaration completes it, on its own",
      docs_g["pregnancy_declaration"] == "uploaded" and "Signed non-pregnancy declaration" not in missing_en(girl_id), docs_g)
status, opened = call("GET", "/api/member/me/medical/documents/pregnancy_declaration", token=GIRL)
check("and she can open it", status == 200 and opened[:4] == b"\x89PNG")
check("the two stay two records",
      sql("select GuardianConsentAttachmentId, PregnancyDeclarationAttachmentId from AthleteMedicalFiles "
          "where AthleteRegistrationId=?", (girl_id,))[0] == (consent["id"], declaration["id"]))

say("")
say("=== one age per tournament: registration, Medical File and the desk agree ===")

# A tournament in next calendar year: the athletes below are a year older for
# it than they are today, and every age-dependent medical rule must use that.
NEXT_YEAR = TODAY.year + 1
st, made = call("POST", "/api/admin/tournaments", {
    "nameAr": "بطولة العام القادم", "nameEn": "Next Year Cup " + latin(),
    "type": "local", "competitionType": "muaythai_combat", "locationAr": "الرياض", "locationEn": "Riyadh",
    "startDate": "%d-01-20" % NEXT_YEAR, "endDate": "%d-01-21" % NEXT_YEAR,
    "registrationClosesAt": "%d-01-10T00:00:00" % NEXT_YEAR, "firstBoutTime": "17:00:00",
    "genders": ["male", "female"], "categories": ["u18", "u24", "elite"], "activityCategory": "regional",
}, token=ADMIN)
NEXT_T = made["id"]
call("POST", "/api/admin/tournaments/%d/publish" % NEXT_T, token=ADMIN)

# 17 today, 18 for that tournament: an adult there — declarations, no guardian.
boy_id, boy_email, BOY_N = athlete(17, "male", dateOfBirth="%d-03-01" % (TODAY.year - 17))
# 15 today, 16 for that tournament: the HIV test applies there, and she is still a minor.
girl_n_id, girl_n_email, GIRL_N = athlete(15, "female", dateOfBirth="%d-03-01" % (TODAY.year - 15))

for label, rid, token, age, adult, screening in (
        ("17 now, 18 then", boy_id, BOY_N, NEXT_YEAR - (TODAY.year - 17), True, True),
        ("15 now, 16 then", girl_n_id, GIRL_N, NEXT_YEAR - (TODAY.year - 15), False, True)):
    view_n = form(NEXT_T, token)[1]
    med = view_n["medical"]
    check("%s - registration uses the tournament year: age %d" % (label, age),
          view_n["eligibility"]["competitionAge"] == age == med["competitionAge"]
          and med["screeningApplies"] is screening and med["declarationsApply"] is adult
          and med["guardianConsentApplies"] is (not adult), med)

    first = view_n["eligibility"]["eligibleCategories"][0]["divisions"][0]["divisionId"]
    status, entry_n = enter(NEXT_T, token, rid, first)
    group_n = next(t for t in requirements(token)[1]["tournaments"] if t["tournamentId"] == NEXT_T)
    keys_n = [d["key"] for d in group_n["documents"]]
    check("%s - the Medical File lists the same requirements" % label,
          status == 200 and group_n["competitionAge"] == age
          and ("screening" in keys_n) is screening and ("guardian_consent" in keys_n) is (not adult), (group_n["competitionAge"], keys_n))

    desk = next(e for e in call("GET", "/api/admin/tournaments/%d/entries" % NEXT_T, token=ADMIN)[1]
                if e["athleteRegistrationId"] == rid)
    desk_missing = [m["en"] for m in desk["medicalMissing"]]
    check("%s - the examination desk uses the same age" % label,
          desk["competitionAge"] == age
          and ("HIV / HBV / HCV screening" in desk_missing) is screening
          and ("Signed guardian consent" in desk_missing) is (not adult)
          and ("Declarations and consents" in desk_missing) is adult, (desk["competitionAge"], desk_missing))

    guardian_status = call("GET", "/api/member/me/medical/guardian-consent?tournamentId=%d" % NEXT_T, token=token)[0]
    check("%s - the guardian form applies exactly when the tournament says so" % label,
          (guardian_status == 200) is (not adult), guardian_status)
    check("%s - and with no tournament named, the latest entry's tournament decides the same" % label,
          (call("GET", "/api/member/me/medical/guardian-consent", token=token)[0] == 200) is (not adult))

check("the girl's separate non-pregnancy form applies for that tournament",
      call("GET", "/api/member/me/medical/pregnancy-declaration?tournamentId=%d" % NEXT_T, token=GIRL_N)[0] == 200
      and call("GET", "/api/admin/athletes/%d/medical/pregnancy-declaration?tournamentId=%d" % (girl_n_id, NEXT_T),
               token=ADMIN)[0] == 200)

say("")
say("=" * 60)
say("FAILED: " + (", ".join(failures) if failures else "none"))
sys.exit(1 if failures else 0)
