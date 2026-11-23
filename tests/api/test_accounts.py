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
# A club's form also carries the applicant's own name; the club goes by its own.
check("the club's page is named after the club, not its applicant",
      me["membership"]["nameAr"] == "نادي الرياض" and me["membership"]["nameEn"].startswith("Riyadh Club"),
      me["membership"])

say("")
say("=== REQ-05 rule 2: the club adds athletes and coaches by email ===")

athlete_id, athlete_email = make_athlete(25)
before = set(glob.glob(os.path.join(OUTBOX, "*")))
status, added = call("POST", "/api/member/roster/invite",
                     {"email": athlete_email, "kind": "athlete",
                      "registrationId": athlete_id, "displayName": "Ali"}, token=CLUB)
check("an athlete with no account is invited", status == 200 and added["isPending"] is True, added)
check("the club's invitation to them is pending", added.get("invitationStatus") == "pending", added)
athlete_token_value = invite_token(before)
check("they get an invitation link", athlete_token_value is not None)

# A club's invitation is a question: the athlete is not the club's until they accept.
status, roster = call("GET", "/api/member/roster", token=CLUB)
check("while it is pending they are not on the club's roster", roster["athletes"] == [], roster["athletes"])
check("the club may invite", roster["canInvite"] is True)
check("the club sees its invitation, pending",
      any(i["kind"] == "athlete" and i["status"] == "pending" for i in call("GET", "/api/member/invitations", token=CLUB)[1]))

status, activated = call("POST", "/api/member/activate",
                         {"token": athlete_token_value, "password": "AthletePass2026"})
ATHLETE = activated["token"]
check("activating the account does not join the club",
      call("GET", "/api/member/me", token=ATHLETE)[1]["club"] is None)
athlete_invites = call("GET", "/api/member/invitations", token=ATHLETE)[1]
status, accepted = call("POST", "/api/member/invitations/%d/accept" % athlete_invites[0]["id"], token=ATHLETE)
check("the athlete accepts the club's invitation", status == 200 and accepted["status"] == "accepted", accepted)
status, roster = call("GET", "/api/member/roster", token=CLUB)
check("only then are they on the roster, active",
      len(roster["athletes"]) == 1 and roster["athletes"][0]["isPending"] is False, roster["athletes"])

# an address already on the roster is not invited a second time
second_club_id, _ = make_club()
status, direct = call("POST", "/api/member/roster/invite",
                      {"email": athlete_email, "kind": "athlete",
                       "registrationId": athlete_id}, token=CLUB)
check("an athlete already on the club's roster is not invited again (rule 2)", status == 409, direct)

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

# A club's invitation is a question: the coach is not the club's until they accept.
status, roster = call("GET", "/api/member/roster", token=COACH)
check("while the invitation is pending, the coach sees none of the club's players",
      status == 200 and roster["athletes"] == [], len(roster.get("athletes", [])))
status, pending_invites = call("GET", "/api/member/invitations", token=COACH)
check("the coach has the club's invitation, pending",
      len(pending_invites) == 1 and pending_invites[0]["status"] == "pending", pending_invites)
check("the invitation names the club, not its applicant",
      pending_invites[0]["club"]["nameAr"] == "نادي الرياض", pending_invites[0]["club"])
_, coach_notices = call("GET", "/api/member/notifications", token=COACH)
check("the coach's notice names the club, not its applicant",
      any(n["type"] == "club_invitation.received" and "نادي الرياض" in n["bodyAr"]
          and "Riyadh Club" in n["bodyEn"] and "خالد" not in n["bodyAr"] for n in coach_notices["items"]),
      coach_notices)
status, accepted = call("POST", "/api/member/invitations/%d/accept" % pending_invites[0]["id"], token=COACH)
check("the coach accepts it", status == 200 and accepted["status"] == "accepted", accepted)

status, roster = call("GET", "/api/member/roster", token=COACH)
check("the coach sees the club's athletes (rule 2)", len(roster["athletes"]) >= 1, len(roster["athletes"]))
check("and is told they cannot invite (rule 3)", roster["canInvite"] is False)

status, refused = call("POST", "/api/member/roster/invite",
                       {"email": "someone@example.com", "kind": "athlete",
                        "registrationId": athlete_id}, token=COACH)
check("the API refuses a coach's invitation, not just the button", status == 403, status)

status, me = call("GET", "/api/member/me", token=COACH)
check("the coach's page names their club (rule 1)", me["club"] is not None, me.get("club"))
check("by the club's own name", me["club"]["nameAr"] == "نادي الرياض", me["club"])

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

# A portal shows every published tournament, and a club with one athlete will
# not be able to enter all of them. Take the first that this athlete fits,
# rather than the first in the list, so the order they were created in does
# not decide whether this passes.
tid, eligible, candidate = tournaments[0]["id"], [], None
for offered in tournaments:
    status, listed = call("GET", "/api/member/tournaments/%d/eligible" % offered["id"], token=CLUB)
    if status != 200:
        continue
    found = next((a for a in listed if a["canEnter"]), None)
    if eligible == [] or found is not None:
        tid, eligible = offered["id"], listed
    if found is not None:
        candidate = found
        break

check("the club is shown its athletes and whether each may enter", len(eligible) >= 1, len(eligible))
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
say("=== the club account's statistics come from its roster and entries ===")

status, stats = call("GET", "/api/member/club/statistics", token=CLUB)
check("a club reads its statistics", status == 200, status)
totals = (stats or {}).get("totals", {})
roster_now = call("GET", "/api/member/roster", token=CLUB)[1]
check("players and coaches are the club's roster",
      totals.get("athletes") == len(roster_now["athletes"]) and totals.get("coaches") == len(roster_now["coaches"]),
      (totals, len(roster_now["athletes"]), len(roster_now["coaches"])))
gender = stats.get("gender", {})
check("every player is counted once by gender",
      gender.get("male", 0) + gender.get("female", 0) + gender.get("unknown", 0) == totals.get("athletes"), gender)
check("and once by age category",
      sum(c["count"] for c in stats.get("categories", [])) + stats.get("categoryUnknown", 0) == totals.get("athletes"),
      [c for c in stats.get("categories", []) if c["count"]])
if candidate:
    check("the athlete it entered is counted as taking part", totals.get("athletesInTournaments", 0) >= 1, totals)
    check("in a tournament the club is entered in", totals.get("tournaments", 0) >= 1, totals)
    check("which shows on the participation chart", sum(p["tournaments"] for p in stats.get("participation", [])) >= 1,
          stats.get("participation"))
check("classification is reported as unavailable, not invented", stats.get("classification") is None)

status, _ = call("GET", "/api/member/club/statistics", token=ATHLETE)
check("an athlete cannot read a club's statistics", status == 403, status)
status, _ = call("GET", "/api/member/club/statistics")
check("nor can anyone signed out", status in (401, 403), status)

say("")
say("=== the club account: invitations by email alone ===")


def roster_entry(email):
    listed = call("GET", "/api/member/roster", token=CLUB)[1]
    return next((p for p in listed["athletes"] + listed["coaches"] if p["email"] == email.lower()), None)


girl_id, girl_email = make_athlete(16, "female")
status, added = call("POST", "/api/member/roster/invite", {"email": girl_email.upper(), "kind": "athlete"}, token=CLUB)
check("a club invites an approved athlete by email alone", status == 200 and added["isPending"] is True, added)

status, again = call("POST", "/api/member/roster/invite", {"email": girl_email, "kind": "athlete"}, token=CLUB)
check("inviting the same address again is not a second invitation",
      status == 200 and sql("select count(*) from MemberAccounts where Email=?", (girl_email.lower(),))[0][0] == 1
      and again["invitationId"] == added["invitationId"],
      status)

check("the invited athlete is not on the roster while it is pending", roster_entry(girl_email) is None)

status, _ = call("POST", "/api/member/roster/invite",
                 {"email": "nobody%s@example.com" % uuid.uuid4().hex[:6], "kind": "athlete"}, token=CLUB)
check("an address with no approved athlete behind it is refused", status == 409, status)

status, _ = call("POST", "/api/member/roster/invite", {"email": girl_email, "kind": "official"}, token=CLUB)
check("a club invites athletes and coaches only", status == 400, status)

status, signed = call("POST", "/api/member/login", {"email": girl_email, "password": "123"})
check("the invited athlete signs in (development: no email yet)", status == 200, status)
check("signing in alone does not join the club", roster_entry(girl_email) is None)
GIRL = signed["token"]
call("POST", "/api/member/invitations/%d/accept" % call("GET", "/api/member/invitations", token=GIRL)[1][0]["id"], token=GIRL)
girl = roster_entry(girl_email)
check("accepting takes the invitation up: on this club, active", girl and girl["isPending"] is False, girl)
check("with the athlete's gender and age category from their record",
      girl and girl["gender"] == "female" and girl["category"] == "u18", girl and (girl["gender"], girl["category"]))
check("and a photo address only when there is a photo", girl and "photoUrl" in girl, girl)

status, _ = call("DELETE", "/api/member/roster/%d/invitation" % girl["id"], token=CLUB)
check("an accepted invitation cannot be cancelled", status == 409, status)

boy_id, boy_email = make_athlete(20)
_, boy_invite = call("POST", "/api/member/roster/invite", {"email": boy_email, "kind": "athlete"}, token=CLUB)
status, _ = call("POST", "/api/member/invitations/%d/cancel" % boy_invite["invitationId"], token=ATHLETE)
check("only the club cancels its invitations", status in (401, 403), status)
status, _ = call("POST", "/api/member/invitations/%d/cancel" % boy_invite["invitationId"], token=CLUB)
check("the club cancels a pending invitation", status == 200, status)
check("and it never reached the roster", roster_entry(boy_email) is None)

other_id, other_email = make_athlete(22)
call("POST", "/api/member/roster/invite", {"email": other_email, "kind": "athlete"}, token=CLUB)
sql("update MemberAccounts set ClubRegistrationId=999999 where Email=?", (other_email.lower(),))
status, _ = call("POST", "/api/member/roster/invite", {"email": other_email, "kind": "athlete"}, token=CLUB)
check("an athlete linked to another club is not taken by an invitation", status == 409, status)

status, listed = call("GET", "/api/member/tournaments", token=CLUB)
check("tournaments carry their type and competition type by name",
      listed and all(t.get("typeEn") and t.get("competitionTypeEn") for t in listed),
      [(t.get("typeEn"), t.get("competitionTypeEn")) for t in (listed or [])][:3])

say("")
say("=== the club account: details change only once approved ===")

status, profile = call("GET", "/api/member/me/profile", token=CLUB)
check("the club reads its registration details", status == 200 and profile["fields"].get("nameEn"), profile.get("fields", {}).get("nameEn"))
before_city = profile["fields"].get("city")

status, _ = call("POST", "/api/member/me/changes", {"changes": {"city": "Abha"}}, token=CLUB)
check("the club proposes a change", status == 200, status)
status, profile = call("GET", "/api/member/me/profile", token=CLUB)
check("it is shown as pending", (profile.get("pending") or {}).get("changes", {}).get("city") == "Abha", profile.get("pending"))
check("while the approved value stays the official one", profile["fields"].get("city") == before_city, profile["fields"].get("city"))

change_id = sql("select Id from MemberProfileChanges where Status='pending' and ChangesJson like ? order by Id desc",
                ('%Abha%',))[0][0]
status, _ = call("POST", "/api/admin/member-accounts/changes/%d/review" % change_id,
                 {"approve": True, "note": "ok"}, token=ADMIN)
check("an administrator approves it", status == 200, status)
status, profile = call("GET", "/api/member/me/profile", token=CLUB)
check("and only then does the club's record change", profile["fields"].get("city") == "Abha" and profile["pending"] is None,
      (profile["fields"].get("city"), profile.get("pending")))

say("")
say("=== the coach account: the club's roster, read-only ===")

club_stats = call("GET", "/api/member/club/statistics", token=CLUB)[1]
status, coach_stats = call("GET", "/api/member/club/statistics", token=COACH)
check("a coach reads statistics", status == 200 and coach_stats.get("linkedToClub") is True, status)
check("and they are their club's, figure for figure",
      coach_stats.get("totals") == club_stats.get("totals") and coach_stats.get("gender") == club_stats.get("gender"),
      (coach_stats.get("totals"), club_stats.get("totals")))

club_roster = call("GET", "/api/member/roster", token=CLUB)[1]
coach_roster = call("GET", "/api/member/roster", token=COACH)[1]
check("a coach sees exactly the club's players",
      sorted(p["id"] for p in coach_roster["athletes"]) == sorted(p["id"] for p in club_roster["athletes"]),
      len(coach_roster["athletes"]))

newcomer_id, newcomer_email = make_athlete(19)
call("POST", "/api/member/roster/invite", {"email": newcomer_email, "kind": "athlete"}, token=CLUB)
check("a player only invited is not shown to the club's coaches",
      all(p["email"] != newcomer_email.lower() for p in call("GET", "/api/member/roster", token=COACH)[1]["athletes"]))
NEWCOMER = call("POST", "/api/member/login", {"email": newcomer_email, "password": "123"})[1]["token"]
call("POST", "/api/member/invitations/%d/accept" % call("GET", "/api/member/invitations", token=NEWCOMER)[1][0]["id"],
     token=NEWCOMER)
coach_roster = call("GET", "/api/member/roster", token=COACH)[1]
check("a player the club adds appears for its coaches with no assignment",
      any(p["email"] == newcomer_email.lower() for p in coach_roster["athletes"]))
check("and nothing records a coach-to-player link: it is the club's roster",
      sql("select ClubRegistrationId from MemberAccounts where Email=?", (newcomer_email.lower(),))[0][0]
      == sql("select ClubRegistrationId from MemberAccounts where Email=?", (coach_email,))[0][0])

newcomer = next(p for p in coach_roster["athletes"] if p["email"] == newcomer_email.lower())
status, _ = call("DELETE", "/api/member/roster/%d/invitation" % newcomer["id"], token=COACH)
check("a coach cannot cancel the club's invitations", status in (401, 403), status)
status, _ = call("POST", "/api/member/roster/invite", {"email": newcomer_email, "kind": "athlete"}, token=COACH)
check("nor invite anyone", status == 403, status)

status, by_query = call("GET", "/api/member/roster?clubRegistrationId=999999&club=999999", token=COACH)
check("naming another club in the request changes nothing",
      sorted(p["id"] for p in by_query["athletes"]) == sorted(p["id"] for p in coach_roster["athletes"]))

say("")
say("=== club -> coach invitations: nothing is linked until the coach accepts ===")


def new_coach():
    """An approved coach with an account of their own (development sign-in) and no club."""
    email = "c%s@example.com" % uuid.uuid4().hex[:8]
    payload = dict(coach_payload, email=email, nationalId="1" + str(uuid.uuid4().int)[:9], familyNameEn="Al" + latin())
    st, made = call("POST", "/api/registrations", {"type": "coach", "payload": payload})
    approve(sql("select Id from Registrations where ReferenceNumber=?", (made["referenceNumber"],))[0][0])
    st, signed = call("POST", "/api/member/login", {"email": email, "password": "123"})
    assert st == 200, signed
    return email, signed["token"]


def notices(token):
    return call("GET", "/api/member/notifications", token=token)[1]


def invitation_for(token):
    listed = call("GET", "/api/member/invitations", token=token)[1]
    return listed[0] if listed else None


club_athletes = sorted(p["id"] for p in call("GET", "/api/member/roster", token=CLUB)[1]["athletes"])

# FLOW 1 — the club invites; the coach is asked, not attached.
c1_email, C1 = new_coach()
status, sent = call("POST", "/api/member/roster/invite", {"email": c1_email, "kind": "coach"}, token=CLUB)
check("flow 1 - the club's invitation is pending", status == 200 and sent.get("invitationStatus") == "pending", sent)
check("the coach is not linked to the club",
      call("GET", "/api/member/me", token=C1)[1]["club"] is None
      and sql("select ClubRegistrationId from MemberAccounts where Email=?", (c1_email,))[0][0] is None)
check("the coach sees no club players", call("GET", "/api/member/roster", token=C1)[1]["athletes"] == [])
check("nor the club's statistics", call("GET", "/api/member/club/statistics", token=C1)[1]["linkedToClub"] is False)
c1_notices = notices(C1)
check("the coach has an unread notice of it, leading to their requests",
      c1_notices["unread"] == 1 and c1_notices["items"][0]["type"] == "club_invitation.received"
      and "section=requests" in c1_notices["items"][0]["target"], c1_notices)
inv1 = invitation_for(C1)
check("and the invitation is in their requests, with the club's name",
      inv1 and inv1["status"] == "pending" and inv1["club"]["nameEn"], inv1)

status, again = call("POST", "/api/member/roster/invite", {"email": c1_email, "kind": "coach"}, token=CLUB)
check("inviting again does not make a second invitation",
      again.get("invitationId") == sent.get("invitationId")
      and sql("select count(*) from ClubInvitations where MemberAccountId=(select Id from MemberAccounts where Email=?)",
              (c1_email,))[0][0] == 1)

club_unread_before = notices(CLUB)["unread"]

# FLOW 2 — the coach accepts: now, and only now, the coach is the club's.
status, done = call("POST", "/api/member/invitations/%d/accept" % inv1["id"], token=C1)
check("flow 2 - the coach accepts", status == 200 and done["status"] == "accepted", done)
check("the club now shows in the coach's account", call("GET", "/api/member/me", token=C1)[1]["club"] is not None)
check("the club's players appear for the coach",
      sorted(p["id"] for p in call("GET", "/api/member/roster", token=C1)[1]["athletes"]) == club_athletes)
check("and the statistics use the club's roster",
      call("GET", "/api/member/club/statistics", token=C1)[1]["linkedToClub"] is True)
club_notices = notices(CLUB)
check("the club is told", club_notices["unread"] == club_unread_before + 1
      and club_notices["items"][0]["type"] == "club_invitation.accepted", club_notices["items"][:1])
check("and sees the coach as one of its coaches",
      any(p["email"] == c1_email for p in call("GET", "/api/member/roster", token=CLUB)[1]["coaches"]))
check("an accepted invitation cannot be answered again",
      call("POST", "/api/member/invitations/%d/reject" % inv1["id"], token=C1)[0] == 409)

# FLOW 3 — the coach declines.
c2_email, C2 = new_coach()
call("POST", "/api/member/roster/invite", {"email": c2_email, "kind": "coach"}, token=CLUB)
inv2 = invitation_for(C2)
status, done = call("POST", "/api/member/invitations/%d/reject" % inv2["id"], token=C2)
check("flow 3 - the coach declines", status == 200 and done["status"] == "rejected", done)
check("and is not linked", call("GET", "/api/member/me", token=C2)[1]["club"] is None
      and call("GET", "/api/member/roster", token=C2)[1]["athletes"] == [])
check("the club is told", notices(CLUB)["items"][0]["type"] == "club_invitation.rejected")
check("a declined invitation cannot be accepted later",
      call("POST", "/api/member/invitations/%d/accept" % inv2["id"], token=C2)[0] == 409)

# FLOW 4 — the club withdraws before an answer.
c3_email, C3 = new_coach()
call("POST", "/api/member/roster/invite", {"email": c3_email, "kind": "coach"}, token=CLUB)
inv3 = invitation_for(C3)
status, done = call("POST", "/api/member/invitations/%d/cancel" % inv3["id"], token=CLUB)
check("flow 4 - the club cancels a pending invitation", status == 200 and done["status"] == "cancelled", done)
check("which can then not be accepted", call("POST", "/api/member/invitations/%d/accept" % inv3["id"], token=C3)[0] == 409)
check("the coach stays unlinked, and is told",
      call("GET", "/api/member/me", token=C3)[1]["club"] is None
      and notices(C3)["items"][0]["type"] == "club_invitation.cancelled")
check("the cancellation shows as such", invitation_for(C3)["status"] == "cancelled")
check("a club cannot cancel what is already answered",
      call("POST", "/api/member/invitations/%d/cancel" % inv1["id"], token=CLUB)[0] == 409)

# FLOW 5 — nobody reaches what is not theirs.
check("flow 5 - a coach cannot answer another coach's invitation",
      call("POST", "/api/member/invitations/%d/accept" % inv1["id"], token=C2)[0] == 404)
check("a coach cannot cancel invitations", call("POST", "/api/member/invitations/%d/cancel" % inv2["id"], token=C2)[0] == 403)
club_notice_id = notices(CLUB)["items"][0]["id"]
check("a member cannot mark someone else's notice read",
      call("POST", "/api/member/notifications/%d/read" % club_notice_id, token=C2)[0] == 404)
check("and only ever lists their own",
      not {n["id"] for n in notices(C2)["items"]} & {n["id"] for n in notices(CLUB)["items"]})

other_club_id, other_club_email = make_club()
status, signed = call("POST", "/api/member/login", {"email": other_club_email, "password": "123"})
OTHER_CLUB = signed["token"]
check("another club sees none of this club's invitations", call("GET", "/api/member/invitations", token=OTHER_CLUB)[1] == [])
check("and cannot cancel them", call("POST", "/api/member/invitations/%d/cancel" % inv1["id"], token=OTHER_CLUB)[0] == 404)
check("an athlete reads only their own invitations, none of the coaches'",
      all(i["kind"] == "athlete" for i in call("GET", "/api/member/invitations", token=ATHLETE)[1]))
check("nor can anyone signed out", call("GET", "/api/member/notifications")[0] in (401, 403))

status, _ = call("POST", "/api/member/roster/invite", {"email": c1_email, "kind": "coach"}, token=OTHER_CLUB)
check("a coach already with a club is not invited by another", status == 409, status)

# One club at a time: a coach holding two invitations can accept only one.
c4_email, C4 = new_coach()
call("POST", "/api/member/roster/invite", {"email": c4_email, "kind": "coach"}, token=CLUB)
call("POST", "/api/member/roster/invite", {"email": c4_email, "kind": "coach"}, token=OTHER_CLUB)
mine = call("GET", "/api/member/invitations", token=C4)[1]
check("a coach can hold invitations from two clubs", len(mine) == 2, len(mine))
first, second = mine[0], mine[1]
call("POST", "/api/member/invitations/%d/accept" % first["id"], token=C4)
status, refused = call("POST", "/api/member/invitations/%d/accept" % second["id"], token=C4)
check("but cannot accept a second once in a club", status == 409, refused)

# Read and unread.
before = notices(C1)["unread"]
call("POST", "/api/member/notifications/%d/read" % notices(C1)["items"][0]["id"], token=C1)
check("opening a notice marks it read", notices(C1)["unread"] == max(before - 1, 0))
call("POST", "/api/member/notifications/read-all", token=CLUB)
check("and all can be marked read at once", notices(CLUB)["unread"] == 0)

say("")
say("=== flow 6: account tournament lists show only open registration ===")

status, made = call("POST", "/api/admin/tournaments", {
    "nameAr": "بطولة مغلقة", "nameEn": "Closed Entries " + latin(), "type": "local",
    "competitionType": "muaythai_combat", "locationAr": "الرياض", "locationEn": "Riyadh",
    "startDate": "%d-12-20" % YEAR, "endDate": "%d-12-21" % YEAR, "firstBoutTime": "17:00:00",
    "genders": ["male"], "categories": ["elite"], "activityCategory": "regional",
}, token=ADMIN)
CLOSED_T = made["id"]
call("POST", "/api/admin/tournaments/%d/publish" % CLOSED_T, token=ADMIN)
sql("update Tournaments set RegistrationClosesAt='2000-01-01 00:00:00' where Id=?", (CLOSED_T,))

everything = call("GET", "/api/member/tournaments", token=CLUB)[1]
check("the full list still holds the closed one (history kept)", any(t["id"] == CLOSED_T for t in everything))
for who, token in (("club", CLUB), ("coach", C1)):
    open_only = call("GET", "/api/member/tournaments?open=true", token=token)[1]
    check("the %s's open list leaves it out" % who, all(t["id"] != CLOSED_T for t in open_only))
    check("and holds only tournaments taking entries now" if who == "club" else "the same for the coach",
          all(t["registrationOpen"] for t in open_only), [t["registrationOpen"] for t in open_only])

say("")
say("=== a coach with no club ===")

lone_email = "lone.coach%s@example.com" % uuid.uuid4().hex[:8]
lone_payload = dict(coach_payload, email=lone_email, nationalId="1" + str(uuid.uuid4().int)[:9],
                    familyNameEn="Al" + latin())
st, created = call("POST", "/api/registrations", {"type": "coach", "payload": lone_payload})
approve(sql("select Id from Registrations where ReferenceNumber=?", (created["referenceNumber"],))[0][0])
status, lone = call("POST", "/api/member/login", {"email": lone_email, "password": "123"})
LONE = lone["token"]
status, me_lone = call("GET", "/api/member/me", token=LONE)
check("an approved coach with no club signs in", status == 200 and me_lone["kind"] == "coach" and me_lone["club"] is None,
      me_lone.get("club"))
status, lone_stats = call("GET", "/api/member/club/statistics", token=LONE)
check("their statistics say there is no club, and show nobody's",
      status == 200 and lone_stats["linkedToClub"] is False and lone_stats["totals"]["athletes"] == 0, lone_stats.get("totals"))
status, lone_roster = call("GET", "/api/member/roster", token=LONE)
check("and they see no players", status == 200 and lone_roster["athletes"] == [] and lone_roster["coaches"] == [])

say("")
say("=== the club lets a player or coach go: only the link to the club ends ===")


def account_of(email):
    return sql("select Id, ClubRegistrationId, IsActive, RegistrationId from MemberAccounts where Email=?", (email,))[0]


coach_account_id, _, _, coach_registration = account_of(coach_email)
athlete_account_id, _, _, _ = account_of(athlete_email)
entries_before = sql("select count(*) from TournamentEntries where AthleteRegistrationId=?", (athlete_id,))[0][0]
coach_invites_before = sql("select Id, Status from ClubInvitations where MemberAccountId=?", (coach_account_id,))
players_before = call("GET", "/api/member/club/statistics", token=CLUB)[1]["totals"]["athletes"]

# Case 6 first — nobody detaches another club's people, nor any club's from outside it.
check("case 6 - another club cannot remove this club's player",
      call("POST", "/api/member/roster/%d/remove" % athlete_account_id, token=OTHER_CLUB)[0] == 404)
check("nor its coach", call("POST", "/api/member/roster/%d/remove" % coach_account_id, token=OTHER_CLUB)[0] == 404)
check("and both are still the club's",
      account_of(athlete_email)[1] is not None and account_of(coach_email)[1] is not None)
check("a coach cannot remove anyone",
      call("POST", "/api/member/roster/%d/remove" % athlete_account_id, token=COACH)[0] == 403)
check("nor an athlete", call("POST", "/api/member/roster/%d/remove" % coach_account_id, token=ATHLETE)[0] == 403)
check("nor anyone signed out", call("POST", "/api/member/roster/%d/remove" % athlete_account_id)[0] in (401, 403))

# Case 7 — a coach not yet answered is not removed; their invitation is cancelled.
c7_email, C7 = new_coach()
call("POST", "/api/member/roster/invite", {"email": c7_email, "kind": "coach"}, token=CLUB)
check("case 7 - a coach still invited cannot be 'removed' (they are not on the roster)",
      call("POST", "/api/member/roster/%d/remove" % account_of(c7_email)[0], token=CLUB)[0] == 404)
check("their invitation is cancelled instead",
      call("POST", "/api/member/invitations/%d/cancel" % invitation_for(C7)["id"], token=CLUB)[0] == 200)

# Case 4 — the club removes a player.
status, removed = call("POST", "/api/member/roster/%d/remove" % athlete_account_id, token=CLUB)
check("case 4 - the club removes its player", status == 200 and removed["removed"] is True, removed)
_, club_id_now, active, _ = account_of(athlete_email)
check("the player is off the roster", all(p["id"] != athlete_account_id
                                          for p in call("GET", "/api/member/roster", token=CLUB)[1]["athletes"]))
check("their account remains, still active, with no club", active == 1 and club_id_now is None)
check("their membership remains approved",
      sql("select Status from Registrations where Id=?", (athlete_id,))[0][0] == "approved")
check("their tournament entries are kept",
      sql("select count(*) from TournamentEntries where AthleteRegistrationId=?", (athlete_id,))[0][0] == entries_before)
check("the club's statistics no longer count them",
      call("GET", "/api/member/club/statistics", token=CLUB)[1]["totals"]["athletes"] == players_before - 1)
check("the player can still sign in", call("GET", "/api/member/me", token=ATHLETE)[0] == 200)
athlete_notice = next((n for n in notices(ATHLETE)["items"] if n["type"] == "club_membership.ended"), None)
check("and is told, by the club's name", athlete_notice is not None and "نادي الرياض" in athlete_notice["bodyAr"],
      athlete_notice)

# Case 5 — the club's coach no longer sees the player.
check("case 5 - the club's coach no longer sees them",
      all(p["id"] != athlete_account_id for p in call("GET", "/api/member/roster", token=COACH)[1]["athletes"]))
check("nor counts them",
      call("GET", "/api/member/club/statistics", token=COACH)[1]["totals"]["athletes"] == players_before - 1)
check("removing them twice finds nobody",
      call("POST", "/api/member/roster/%d/remove" % athlete_account_id, token=CLUB)[0] == 404)

# Case 1 — the club removes a coach who accepted.
status, removed = call("POST", "/api/member/roster/%d/remove" % coach_account_id, token=CLUB)
check("case 1 - the club removes its coach", status == 200 and removed["kind"] == "coach", removed)
_, coach_club_now, coach_active, _ = account_of(coach_email)
check("the coach is unlinked but the account remains", coach_club_now is None and coach_active == 1)
check("their membership remains",
      sql("select count(*) from Registrations where Id=?", (coach_registration,))[0][0] == 1)
check("the accepted invitation stays accepted (history, not state)",
      sql("select Id, Status from ClubInvitations where MemberAccountId=?", (coach_account_id,)) == coach_invites_before)
check("they leave the club's coaches",
      all(c["id"] != coach_account_id for c in call("GET", "/api/member/roster", token=CLUB)[1]["coaches"]))

# Case 2 — the removed coach signs in to an account with no club.
status, me_removed = call("GET", "/api/member/me", token=COACH)
check("case 2 - the removed coach's account works, with no club", status == 200 and me_removed["club"] is None,
      me_removed.get("club"))
check("and no club roster", call("GET", "/api/member/roster", token=COACH)[1]["athletes"] == [])
check("nor club statistics", call("GET", "/api/member/club/statistics", token=COACH)[1]["linkedToClub"] is False)
coach_notice = next((n for n in notices(COACH)["items"] if n["type"] == "club_membership.ended"), None)
check("they are told their link with the club ended",
      coach_notice is not None and "نادي الرياض" in coach_notice["bodyAr"]
      and coach_notice["target"] == "/account/coach", coach_notice)

# Case 3 — inviting them again asks again; nothing reconnects by itself.
status, again = call("POST", "/api/member/roster/invite", {"email": coach_email, "kind": "coach"}, token=CLUB)
check("case 3 - the club can invite the removed coach again",
      status == 200 and again["invitationStatus"] == "pending", again)
check("a new invitation, the old one still accepted",
      sorted(s for _, s in sql("select Id, Status from ClubInvitations where MemberAccountId=?", (coach_account_id,)))
      == sorted([s for _, s in coach_invites_before] + ["pending"]))
check("and they are not linked until they accept", account_of(coach_email)[1] is None)
pending_again = next(i for i in call("GET", "/api/member/invitations", token=COACH)[1] if i["status"] == "pending")
call("POST", "/api/member/invitations/%d/accept" % pending_again["id"], token=COACH)
check("accepting links them once more", account_of(coach_email)[1] is not None)

say("")
say("=== the athlete account: club invitations, own record ===")


def new_athlete(age=24, gender="male"):
    """An approved athlete with an account of their own (development sign-in) and no club."""
    rid, email = make_athlete(age, gender)
    st, signed = call("POST", "/api/member/login", {"email": email, "password": "123"})
    assert st == 200, signed
    return rid, email, signed["token"]


def club_ids_of(token):
    listed = call("GET", "/api/member/roster", token=token)[1]
    return {p["id"] for p in listed["athletes"]}


# FLOW 1 — an approved athlete signs in to their own account.
a1_id, a1_email, A1 = new_athlete(24)
status, a1_me = call("GET", "/api/member/me", token=A1)
check("athlete flow 1 - an approved athlete signs in to an athlete account",
      status == 200 and a1_me["kind"] == "athlete" and a1_me["club"] is None, a1_me.get("kind"))
check("named by their own name", a1_me["membership"]["nameAr"].startswith("علي"), a1_me["membership"]["nameAr"])
status, a1_record = call("GET", "/api/member/athlete/record", token=A1)
check("their record opens, empty, with nothing invented",
      status == 200 and a1_record["entries"] == [] and a1_record["totals"]["participations"] == 0
      and a1_record["totals"]["wins"] == 0 and a1_record["ranking"] is None and a1_record["medals"] is None,
      a1_record)
check("with their general category this year", (a1_record["category"] or {}).get("value") == "elite", a1_record["category"])

# FLOW 2 — the club invites: a question, not a link.
a1_account = sql("select Id from MemberAccounts where Email=?", (a1_email,))[0][0]
players_before = call("GET", "/api/member/club/statistics", token=CLUB)[1]["totals"]["athletes"]
status, sent = call("POST", "/api/member/roster/invite", {"email": a1_email, "kind": "athlete"}, token=CLUB)
check("athlete flow 2 - the club's invitation is pending",
      status == 200 and sent["invitationStatus"] == "pending" and sent["alreadyExisted"] is True, sent)
check("the athlete is not linked", call("GET", "/api/member/me", token=A1)[1]["club"] is None
      and sql("select ClubRegistrationId from MemberAccounts where Id=?", (a1_account,))[0][0] is None)
check("not on the club's roster", a1_account not in club_ids_of(CLUB))
check("not among its coaches' players", a1_account not in club_ids_of(COACH))
check("not in its statistics",
      call("GET", "/api/member/club/statistics", token=CLUB)[1]["totals"]["athletes"] == players_before)
a1_notice = next((n for n in notices(A1)["items"] if n["type"] == "club_invitation.received"), None)
check("the athlete is notified, by the club's name, as a player, leading to their requests",
      a1_notice is not None and "نادي الرياض" in a1_notice["bodyAr"] and "كلاعب" in a1_notice["bodyAr"]
      and "as a player" in a1_notice["bodyEn"] and a1_notice["target"] == "/account/athlete?section=requests",
      a1_notice)
a1_invite = invitation_for(A1)
check("the invitation is in their requests, naming the club",
      a1_invite and a1_invite["kind"] == "athlete" and a1_invite["status"] == "pending"
      and a1_invite["club"]["nameAr"] == "نادي الرياض", a1_invite)

# FLOW 11, part one — nobody else answers it, and only the club cancels it.
a2_id, a2_email, A2 = new_athlete(21)
check("athlete flow 11 - another athlete cannot accept it",
      call("POST", "/api/member/invitations/%d/accept" % a1_invite["id"], token=A2)[0] == 404)
check("nor reject it", call("POST", "/api/member/invitations/%d/reject" % a1_invite["id"], token=A2)[0] == 404)
check("nor see it", call("GET", "/api/member/invitations", token=A2)[1] == [])
check("nor read the athlete's notices",
      not {n["id"] for n in notices(A2)["items"]} & {n["id"] for n in notices(A1)["items"]})
check("nor mark them read", call("POST", "/api/member/notifications/%d/read" % a1_notice["id"], token=A2)[0] == 404)
check("an athlete cannot cancel a club's invitation",
      call("POST", "/api/member/invitations/%d/cancel" % a1_invite["id"], token=A1)[0] == 403)
check("an athlete cannot read another athlete's record",
      call("GET", "/api/member/athletes/%d" % a1_id, token=A2)[0] == 403)
check("the athlete record is the athlete's alone",
      call("GET", "/api/member/athlete/record", token=CLUB)[0] == 403
      and call("GET", "/api/member/athlete/record", token=COACH)[0] == 403)

# FLOW 3 — the athlete accepts.
status, answered = call("POST", "/api/member/invitations/%d/accept" % a1_invite["id"], token=A1)
check("athlete flow 3 - the athlete accepts", status == 200 and answered["status"] == "accepted", answered)
a1_me = call("GET", "/api/member/me", token=A1)[1]
check("they are linked, and their page names the club", (a1_me["club"] or {}).get("nameAr") == "نادي الرياض", a1_me["club"])
check("they are on the club's roster, active",
      any(p["id"] == a1_account and p["isPending"] is False for p in call("GET", "/api/member/roster", token=CLUB)[1]["athletes"]))
check("its coaches see them", a1_account in club_ids_of(COACH))
check("its statistics count them",
      call("GET", "/api/member/club/statistics", token=CLUB)[1]["totals"]["athletes"] == players_before + 1)
club_notice = next((n for n in notices(CLUB)["items"]
                    if n["type"] == "club_invitation.accepted" and "لاعب" in n["titleAr"]), None)
check("the club is notified that a player accepted", club_notice is not None and "لاعب" in club_notice["titleAr"], club_notice)
check("answering twice is refused", call("POST", "/api/member/invitations/%d/accept" % a1_invite["id"], token=A1)[0] == 409)

# One club at a time.
_, other_invite = call("POST", "/api/member/roster/invite", {"email": a1_email, "kind": "athlete"}, token=OTHER_CLUB)
check("a club cannot invite another club's player", _ == 409, other_invite)
a3_id, a3_email, A3 = new_athlete(22)
call("POST", "/api/member/roster/invite", {"email": a3_email, "kind": "athlete"}, token=CLUB)
call("POST", "/api/member/roster/invite", {"email": a3_email, "kind": "athlete"}, token=OTHER_CLUB)
both = call("GET", "/api/member/invitations", token=A3)[1]
check("an athlete can hold invitations from two clubs", len(both) == 2, len(both))
call("POST", "/api/member/invitations/%d/accept" % both[0]["id"], token=A3)
status, refused = call("POST", "/api/member/invitations/%d/accept" % both[1]["id"], token=A3)
check("but cannot accept a second once in a club", status == 409, refused)

# FLOW 4 — the athlete declines.
_, a2_sent = call("POST", "/api/member/roster/invite", {"email": a2_email, "kind": "athlete"}, token=CLUB)
status, declined = call("POST", "/api/member/invitations/%d/reject" % a2_sent["invitationId"], token=A2)
check("athlete flow 4 - the athlete declines", status == 200 and declined["status"] == "rejected", declined)
a2_account = sql("select Id from MemberAccounts where Email=?", (a2_email,))[0][0]
check("no link, no roster place", call("GET", "/api/member/me", token=A2)[1]["club"] is None and a2_account not in club_ids_of(CLUB))
check("the club is notified that a player declined",
      any(n["type"] == "club_invitation.rejected" and "لاعب" in n["titleAr"] for n in notices(CLUB)["items"]))
check("a declined invitation cannot be accepted after",
      call("POST", "/api/member/invitations/%d/accept" % a2_sent["invitationId"], token=A2)[0] == 409)

# FLOW 5 — the club withdraws it.
a4_id, a4_email, A4 = new_athlete(23)
_, a4_sent = call("POST", "/api/member/roster/invite", {"email": a4_email, "kind": "athlete"}, token=CLUB)
status, _ = call("POST", "/api/member/invitations/%d/cancel" % a4_sent["invitationId"], token=CLUB)
check("athlete flow 5 - the club cancels a pending invitation", status == 200, status)
check("it reads as cancelled", invitation_for(A4)["status"] == "cancelled")
check("the athlete cannot accept it afterwards",
      call("POST", "/api/member/invitations/%d/accept" % a4_sent["invitationId"], token=A4)[0] == 409)
check("no link was made", call("GET", "/api/member/me", token=A4)[1]["club"] is None)
a4_notice = next((n for n in notices(A4)["items"] if n["type"] == "club_invitation.cancelled"), None)
check("the athlete is told, as a player, leading to their requests",
      a4_notice is not None and "كلاعب" in a4_notice["bodyAr"] and a4_notice["target"] == "/account/athlete?section=requests",
      a4_notice)

# FLOW 6 — the club lets the athlete go.
status, _ = call("POST", "/api/member/roster/%d/remove" % a1_account, token=CLUB)
check("athlete flow 6 - the club removes the athlete", status == 200, status)
check("they are unlinked, account and membership kept",
      call("GET", "/api/member/me", token=A1)[1]["club"] is None
      and sql("select IsActive from MemberAccounts where Id=?", (a1_account,))[0][0] == 1
      and sql("select Status from Registrations where Id=?", (a1_id,))[0][0] == "approved")
check("their accepted invitation stays accepted", invitation_for(A1)["status"] == "accepted")
ended = next((n for n in notices(A1)["items"] if n["type"] == "club_membership.ended"), None)
check("and they are told, leading to their own account",
      ended is not None and ended["target"] == "/account/athlete" and "نادي الرياض" in ended["bodyAr"], ended)
check("their record still opens", call("GET", "/api/member/athlete/record", token=A1)[0] == 200)

# FLOW 8 — a record with a real entry shows it; bouts only as recorded.
status, entered_record = call("GET", "/api/member/athlete/record", token=ATHLETE)
check("athlete flow 8 - an entered athlete's record lists the entry",
      status == 200 and len(entered_record["entries"]) >= 1
      and entered_record["totals"]["participations"] >= 1, entered_record.get("totals"))
check("each with its tournament and status",
      all(e["tournamentNameEn"] and e["statusEn"] for e in entered_record["entries"]), entered_record["entries"][:1])
check("and no result is made up where no bout was decided",
      entered_record["totals"]["boutsDecided"] == sum(1 for e in entered_record["entries"] for b in e["bouts"]
                                                      if b["outcome"] in ("win", "loss")))

# FLOW 9 — no ranking exists, and none is invented.
check("athlete flow 9 - no ranking or medals are invented",
      entered_record["ranking"] is None and entered_record["medals"] is None)

# FLOW 10 — the athlete's tournament list is the open one.
open_list = call("GET", "/api/member/tournaments?open=true", token=A1)[1]
check("athlete flow 10 - an athlete's open list holds only tournaments taking entries",
      all(t["registrationOpen"] for t in open_list), [t["registrationOpen"] for t in open_list])

# Profile changes stay the athlete's own and wait for approval.
status, _ = call("POST", "/api/member/me/changes", {"changes": {"currentWeight": "71.5"}}, token=A1)
a1_profile = call("GET", "/api/member/me/profile", token=A1)[1]
check("an athlete proposes a sports change, which waits for review",
      status == 200 and (a1_profile.get("pending") or {}).get("changes", {}).get("currentWeight") == "71.5"
      and a1_profile["fields"].get("currentWeight") == "70", a1_profile.get("pending"))
check("and it is not another athlete's to see",
      (call("GET", "/api/member/me/profile", token=A2)[1].get("pending") or {}).get("changes", {}).get("currentWeight") != "71.5")
check("identity fields stay locked for athletes",
      call("POST", "/api/member/me/changes", {"changes": {"dateOfBirth": "2001-01-01"}}, token=A1)[0] == 409)

say("")
say("=== the coach's own details change only once approved ===")

status, coach_profile = call("GET", "/api/member/me/profile", token=COACH)
check("a coach reads their own registration, not the club's",
      status == 200 and coach_profile["type"] == "coach" and coach_profile["fields"].get("email") == coach_email,
      coach_profile.get("type"))
status, _ = call("POST", "/api/member/me/changes", {"changes": {"coachingLevel": "Level 2"}}, token=COACH)
status, coach_profile = call("GET", "/api/member/me/profile", token=COACH)
check("a proposed change waits for review",
      (coach_profile.get("pending") or {}).get("changes", {}).get("coachingLevel") == "Level 2"
      and coach_profile["fields"].get("coachingLevel") != "Level 2",
      coach_profile.get("pending"))
status, _ = call("POST", "/api/member/me/changes", {"changes": {"dateOfBirth": "1990-01-01"}}, token=COACH)
check("identity fields cannot be proposed from the account", status == 409, status)

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
