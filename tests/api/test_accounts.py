"""REQ-04 to REQ-07: the medical file and the three portals."""
import json, sys, os, io, re, glob, uuid, urllib.request, urllib.error, datetime, sqlite3

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = os.environ.get("SMF_TEST_API", "http://127.0.0.1:5197")
DB = os.environ["SMF_TEST_DB"]
OUTBOX = os.environ["SMF_TEST_OUTBOX"]
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
ADMIN = body["token"]


def sql(query, args=()):
    con = sqlite3.connect(DB)
    try:
        rows = con.execute(query, args).fetchall()
        con.commit()
        return rows
    finally:
        con.close()


def latin(n=5):
    return "".join(chr(97 + (b % 26)) for b in uuid.uuid4().bytes[:n])


def approve(rid):
    for step in ("under_review", "awaiting_approval"):
        call("PUT", "/api/admin/registrations/%d/status" % rid, {"status": step}, token=ADMIN)
    call("PUT", "/api/admin/registrations/%d/status" % rid,
         {"status": "approved", "membershipNumber": "SMF-%d" % rid}, token=ADMIN)


def make_athlete(age=25, gender="male"):
    payload = {
        "firstNameAr": "علي", "fatherNameAr": "محمد", "familyNameAr": "الحربي",
        "firstNameEn": "Ali", "fatherNameEn": "Mohammed", "familyNameEn": "Al" + latin(),
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": "%d-06-15" % (YEAR - age), "nationality": "SA", "gender": gender,
        "phone": "+966512345678", "email": "ath%s@example.com" % uuid.uuid4().hex[:8],
        "region": "الرياض", "city": "الرياض",
        "paraAthlete": "no", "currentWeight": "70", "consent": True,
    }
    if YEAR - int(payload["dateOfBirth"][:4]) < 19:
        payload.update({"guardianName": "G", "guardianPhone": "+966512345670",
                        "guardianRelation": "father"})
    st, created = call("POST", "/api/registrations", {"type": "athlete", "payload": payload})
    assert st == 200, created
    rid = sql("select Id from Registrations where ReferenceNumber=?", (created["referenceNumber"],))[0][0]
    approve(rid)
    return rid, payload["email"]


def make_club():
    payload = {
        "firstNameAr": "خالد", "fatherNameAr": "علي", "familyNameAr": "الدوسري",
        "firstNameEn": "Khalid", "fatherNameEn": "Ali", "familyNameEn": "Al" + latin(),
        "applicantRole": "owner", "applicantId": "1" + str(uuid.uuid4().int)[:9],
        "nationality": "SA", "applicantPhone": "+966512345678",
        "applicantEmail": "app%s@example.com" % uuid.uuid4().hex[:8],
        "officialEmail": "club%s@example.com" % uuid.uuid4().hex[:8],
        "region": "الرياض", "city": "الرياض",
        "nameAr": "نادي الرياض", "nameEn": "Riyadh Club " + latin(),
        "entityType": "club", "ownerName": "Khalid", "headCoachName": "Coach",
        "headCoachPhone": "+966512345679",
        "googleMapsUrl": "https://maps.google.com/?q=riyadh", "consent": True,
    }
    st, created = call("POST", "/api/registrations", {"type": "club", "payload": payload})
    assert st == 200, created
    rid = sql("select Id from Registrations where ReferenceNumber=?", (created["referenceNumber"],))[0][0]
    approve(rid)
    return rid, payload["officialEmail"]


def invite_token(before):
    """The newest invitation link in the outbox."""
    fresh = sorted(set(glob.glob(os.path.join(OUTBOX, "*"))) - before, key=os.path.getmtime)
    for path in reversed(fresh):
        body = io.open(path, encoding="utf-8", errors="replace").read()
        found = re.search(r"/account/activate\?token=([A-Za-z0-9_\-]+)", body)
        if found:
            return found.group(1)
    return None


# ══════════════════════════════════════════════════════════════════════════
say("=== REQ-05: the federation creates a club account ===")

club_id, club_email = make_club()
before = set(glob.glob(os.path.join(OUTBOX, "*")))

status, invited = call("POST", "/api/admin/member-accounts/invite",
                       {"email": club_email, "kind": "club", "registrationId": club_id,
                        "displayName": "Riyadh Club"}, token=ADMIN)
check("a club is invited", status == 200, invited)
check("it is pending until taken up (rule 2)", invited["isPending"] is True, invited)

token = invite_token(before)
check("an invitation email is sent with a link", token is not None, token and token[:12])

status, body = call("GET", "/api/member/activate/%s" % token)
check("the link checks out before asking for a password", body["valid"] is True, body)

status, body = call("POST", "/api/member/activate", {"token": token, "password": "short"})
check("a weak password is refused", status == 400, status)

status, activated = call("POST", "/api/member/activate",
                         {"token": token, "password": "ClubPass2026"})
check("activation succeeds and signs them in", status == 200 and activated.get("token"), status)
CLUB = activated["token"]

status, again = call("GET", "/api/member/activate/%s" % token)
check("the invitation cannot be used twice", again["valid"] is False, again)

say("")
say("=== the two worlds are kept apart ===")
status, _ = call("GET", "/api/admin/tournaments", token=CLUB)
check("a member token is refused by the console", status == 401, status)
status, _ = call("GET", "/api/member/me", token=ADMIN)
check("an admin token is refused by the portal", status == 401, status)

say("")
say("=== REQ-05 rule 1: the club sees its own record ===")
status, me = call("GET", "/api/member/me", token=CLUB)
check("the club opens its page", status == 200 and me["kind"] == "club", me)
check("it shows the membership", me["membership"]["membershipNumber"] is not None, me["membership"])

say("")
say("=== REQ-05 rule 2: the club adds athletes and coaches by email ===")

athlete_id, athlete_email = make_athlete(25)
before = set(glob.glob(os.path.join(OUTBOX, "*")))
status, added = call("POST", "/api/member/roster/invite",
                     {"email": athlete_email, "kind": "athlete",
                      "registrationId": athlete_id, "displayName": "Ali"}, token=CLUB)
check("an athlete with no account is invited", status == 200 and added["isPending"] is True, added)
athlete_token_value = invite_token(before)
check("they get an invitation link", athlete_token_value is not None)

status, roster = call("GET", "/api/member/roster", token=CLUB)
check("they appear in the roster as pending",
      len(roster["athletes"]) == 1 and roster["athletes"][0]["isPending"] is True, roster["athletes"])
check("the club may invite", roster["canInvite"] is True)

status, activated = call("POST", "/api/member/activate",
                         {"token": athlete_token_value, "password": "AthletePass2026"})
ATHLETE = activated["token"]
status, roster = call("GET", "/api/member/roster", token=CLUB)
check("once activated they are no longer pending", roster["athletes"][0]["isPending"] is False)

# an address that already has a live account is attached directly
second_club_id, _ = make_club()
status, direct = call("POST", "/api/member/roster/invite",
                      {"email": athlete_email, "kind": "athlete",
                       "registrationId": athlete_id}, token=CLUB)
check("an address that already has an account is attached directly (rule 2)",
      direct["alreadyExisted"] is True, direct)

say("")
say("=== REQ-06: the coach sees the club's athletes but invites nobody ===")

coach_payload_id = None
coach_email = "coach%s@example.com" % uuid.uuid4().hex[:8]
coach_payload = {
    "firstNameAr": "سعد", "fatherNameAr": "محمد", "familyNameAr": "القحطاني",
    "firstNameEn": "Saad", "fatherNameEn": "Mohammed", "familyNameEn": "Al" + latin(),
    "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
    "dateOfBirth": "%d-06-15" % (YEAR - 35), "nationality": "SA", "gender": "male",
    "phone": "+966512345678", "email": coach_email,
    "region": "الرياض", "city": "الرياض", "consent": True,
}
st, created = call("POST", "/api/registrations", {"type": "coach", "payload": coach_payload})
coach_payload_id = sql("select Id from Registrations where ReferenceNumber=?",
                       (created["referenceNumber"],))[0][0]
approve(coach_payload_id)

before = set(glob.glob(os.path.join(OUTBOX, "*")))
status, _ = call("POST", "/api/member/roster/invite",
                 {"email": coach_email, "kind": "coach",
                  "registrationId": coach_payload_id}, token=CLUB)
coach_token_value = invite_token(before)
status, activated = call("POST", "/api/member/activate",
                         {"token": coach_token_value, "password": "CoachPass2026"})
COACH = activated["token"]

status, roster = call("GET", "/api/member/roster", token=COACH)
check("the coach sees the club's athletes (rule 2)", len(roster["athletes"]) >= 1, len(roster["athletes"]))
check("and is told they cannot invite (rule 3)", roster["canInvite"] is False)

status, refused = call("POST", "/api/member/roster/invite",
                       {"email": "someone@example.com", "kind": "athlete",
                        "registrationId": athlete_id}, token=COACH)
check("the API refuses a coach's invitation, not just the button", status == 403, status)

status, me = call("GET", "/api/member/me", token=COACH)
check("the coach's page names their club (rule 1)", me["club"] is not None, me.get("club"))

say("")
say("=== REQ-07: the athlete's own page ===")
status, me = call("GET", "/api/member/me", token=ATHLETE)
check("the athlete opens their page", status == 200 and me["kind"] == "athlete", me["kind"])

status, roster = call("GET", "/api/member/roster", token=ATHLETE)
check("an athlete sees no roster of their own", len(roster["athletes"]) == 0)

say("")
say("=== REQ-04: the medical file ===")
status, medical = call("GET", "/api/member/me/medical", token=ATHLETE)
check("the athlete opens their medical file", status == 200, status)
check("it lists the health questions (rule 2, i-viii)", len(medical["questions"]) == 8, len(medical["questions"]))
check("screening applies above 15 (rule 1)", medical["screeningRequired"] is True)
check("declarations apply at 18 and over (rule 3)", medical["declarationsApply"] is True)
check("a guardian consent does not", medical["guardianConsentApplies"] is False)
check("the file starts incomplete", medical["complete"] is False, medical["missing"])
check("rule 6 is stated to the athlete", "will not stop you entering" in medical["noticeEn"])

status, medical = call("PUT", "/api/member/me/medical",
                       {"healthAnswers": {"ko_6_months": False, "medication_now": True},
                        "medications": "Ventolin",
                        "declarations": {"participation": True, "media": True,
                                         "anti_doping": True, "data_accuracy": True}},
                       token=ATHLETE)
check("answers and declarations are saved", status == 200, status)
answered = [q for q in medical["questions"] if q["answer"] is not None]
check("the answers come back", len(answered) == 2, len(answered))
check("the medication name is kept", medical["medications"] == "Ventolin", medical["medications"])

status, medical = call("PUT", "/api/member/me/medical",
                       {"certificateAttachmentId": "a" * 32,
                        "certificateDate": "%d-01-15" % YEAR}, token=ATHLETE)
check("a first certificate applies at once", medical["certificateAttachmentId"] is not None)

# replacing an existing certificate is what rule 5 holds back
status, medical = call("PUT", "/api/member/me/medical",
                       {"certificateAttachmentId": "b" * 32,
                        "certificateDate": "%d-02-15" % YEAR}, token=ATHLETE)
check("replacing an approved certificate waits for approval (rule 5)",
      medical["hasPendingChange"] is True and medical["certificateAttachmentId"] == "a" * 32,
      medical["certificateAttachmentId"][:4])

status, _ = call("POST", "/api/admin/athletes/%d/medical/approve" % athlete_id, token=ADMIN)
status, medical = call("GET", "/api/member/me/medical", token=ATHLETE)
check("once approved it applies", medical["certificateAttachmentId"] == "b" * 32)

say("")
say("=== REQ-05/06/07: an edit waits for the federation ===")
status, body = call("POST", "/api/member/me/changes",
                    {"changes": {"city": "جدة", "coachName": "New Coach"}}, token=ATHLETE)
check("a change is accepted for review", status == 200 and body["submitted"] is True, body)

status, refused = call("POST", "/api/member/me/changes",
                       {"changes": {"dateOfBirth": "1990-01-01"}}, token=ATHLETE)
check("identity fields cannot be changed from an account", status == 409, status)

status, pending = call("GET", "/api/admin/member-accounts/changes", token=ADMIN)
check("the federation sees it pending", len(pending) == 1, len(pending))

city_before = json.loads(sql("select PayloadJson from Registrations where Id=?", (athlete_id,))[0][0])
check("nothing changed yet", city_before.get("city") != "جدة", city_before.get("city"))

status, _ = call("POST", "/api/admin/member-accounts/changes/%d/review" % pending[0]["id"],
                 {"approve": True, "note": "Checked."}, token=ADMIN)
city_after = json.loads(sql("select PayloadJson from Registrations where Id=?", (athlete_id,))[0][0])
check("approving applies it", city_after.get("city") == "جدة", city_after.get("city"))
check("and the other field too", city_after.get("coachName") == "New Coach", city_after.get("coachName"))

say("")
say("=== REQ-05 rule 4 / REQ-07 rule 2: entering from a portal ===")

status, tournaments = call("GET", "/api/member/tournaments", token=CLUB)
check("the club sees published tournaments", len(tournaments) >= 1, len(tournaments))
tid = tournaments[0]["id"]

status, eligible = call("GET", "/api/member/tournaments/%d/eligible" % tid, token=CLUB)
check("the club is shown its athletes and whether each may enter", len(eligible) >= 1, len(eligible))
candidate = next((a for a in eligible if a["canEnter"]), None)
check("at least one is eligible", candidate is not None,
      [a["barriers"] for a in eligible])

if candidate:
    division = candidate["options"][0]["divisions"][0]["divisionId"]
    before = set(glob.glob(os.path.join(OUTBOX, "*")))
    status, entered = call("POST", "/api/member/tournaments/%d/entries" % tid,
                           {"athleteRegistrationId": candidate["registrationId"],
                            "divisionId": division, "declaredWeightKg": 70}, token=CLUB)
    check("the club enters them", status == 200, entered)

    fresh = sorted(set(glob.glob(os.path.join(OUTBOX, "*"))) - before)
    check("the athlete is notified (rule 4)", len(fresh) >= 1, len(fresh))

    status, again = call("POST", "/api/member/tournaments/%d/entries" % tid,
                         {"athleteRegistrationId": candidate["registrationId"],
                          "divisionId": division}, token=CLUB)
    check("the same athlete cannot be entered twice (rule 5)", status == 409, status)

    status, athlete_view = call("GET", "/api/member/athletes/%d" % candidate["registrationId"], token=ATHLETE)
    check("the athlete sees the entry on their own page (rule 3)",
          len(athlete_view["tournaments"]) >= 1, athlete_view.get("tournaments"))

# a club cannot touch an athlete who is not theirs
outsider_id, _ = make_athlete(25)
status, refused = call("POST", "/api/member/tournaments/%d/entries" % tid,
                       {"athleteRegistrationId": outsider_id}, token=CLUB)
check("a club cannot enter an athlete who is not on its roster", status == 403, status)

status, refused = call("GET", "/api/member/athletes/%d" % outsider_id, token=CLUB)
check("nor open their profile", status == 403, status)

say("")
say("=== deactivating an account ends its session at once ===")
account_id = sql("select Id from MemberAccounts where Email=?", (coach_email,))[0][0]
call("POST", "/api/admin/member-accounts/%d/active" % account_id, {"isActive": False}, token=ADMIN)
status, _ = call("GET", "/api/member/me", token=COACH)
check("a deactivated account cannot use its token", status == 401, status)

say("")
say("=" * 60)
say("FAILED: " + (", ".join(failures) if failures else "none"))
# A copy of the run, if somewhere to put it was named.
LOG_PATH = os.environ.get("SMF_TEST_LOG")
if LOG_PATH:
    io.open(LOG_PATH, "w", encoding="utf-8").write(chr(10).join(log) + chr(10))
sys.exit(1 if failures else 0)
