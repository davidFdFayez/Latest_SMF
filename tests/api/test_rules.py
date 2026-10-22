"""
The rules of the document that nothing else was holding the system to.

The other suites were written alongside the code, which means they can agree
with it and both be wrong. These are written from the document's own
sentences instead — the eleven age bands and their exact ends, the two
overlap examples it works out by hand, what a Failed result actually stops,
and the paths that were implemented but never driven: a coach entering an
athlete, the technical team changing a class after registration, an athlete
in two tournaments at once.

Where a rule names a number, the number is here rather than a property.
"""
import json, sys, os, uuid, urllib.request, urllib.error, datetime, sqlite3

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = os.environ.get("SMF_TEST_API", "http://127.0.0.1:5197")
DB = os.environ["SMF_TEST_DB"]
OUTBOX = os.environ.get("SMF_TEST_OUTBOX", "")
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


def athlete(birth_date, gender="male", weight="60", club="Rules Club", email=None):
    """An approved athlete membership with an exact date of birth."""
    born = int(str(birth_date)[:4])
    payload = {
        "firstNameAr": "علي", "fatherNameAr": "محمد", "familyNameAr": "الحربي",
        "firstNameEn": "Ali", "fatherNameEn": "Mohammed",
        "familyNameEn": "Al" + "".join(chr(97 + (b % 26)) for b in uuid.uuid4().bytes[:5]),
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": str(birth_date), "nationality": "SA", "gender": gender,
        "phone": "+966512345678", "email": email or ("r%s@example.com" % uuid.uuid4().hex[:8]),
        "region": "الرياض", "city": "الرياض",
        "paraAthlete": "no", "currentWeight": weight, "clubName": club,
        "consent": True,
    }
    if YEAR - born < 19:
        payload.update({"guardianName": "ولي الأمر", "guardianPhone": "+966512345670",
                        "guardianRelation": "father"})

    st, created = call("POST", "/api/registrations", {"type": "athlete", "payload": payload})
    assert st == 200, created
    rid = sql("select Id from Registrations where ReferenceNumber=?", (created["referenceNumber"],))[0][0]
    for step in ("under_review", "awaiting_approval"):
        call("PUT", "/api/admin/registrations/%d/status" % rid, {"status": step}, token=TOKEN)
    call("PUT", "/api/admin/registrations/%d/status" % rid,
         {"status": "approved", "membershipNumber": "SMF-R-%d" % rid}, token=TOKEN)
    return rid


def born_at(age, month=6, day=15):
    """A date of birth that makes the athlete this age in the tournament year."""
    return "%d-%02d-%02d" % (YEAR - age, month, day)


ALL_CATEGORIES = [
    "u8", "u10", "u12", "u14", "u16", "u18", "u24",
    "elite", "masters_35", "masters_40", "masters_45",
]

# One tournament that runs everything, so eligibility is never narrowed by
# what the tournament happens to offer.
EVERYTHING = {
    "nameAr": "بطولة القواعد", "nameEn": "Rules Championship",
    "type": "kingdom", "competitionType": "muaythai_combat",
    "locationAr": "الرياض", "locationEn": "Riyadh",
    "startDate": "%d-12-10" % YEAR, "endDate": "%d-12-11" % YEAR,
    "firstBoutTime": "17:00:00", "boutIntervalMinutes": 10,
    "registrationOpensAt": "%d-01-01T00:00:00" % YEAR,
    "registrationClosesAt": "%d-12-01T00:00:00" % YEAR,
    "genders": ["male", "female"], "categories": ALL_CATEGORIES,
}

status, made = call("POST", "/api/admin/tournaments", EVERYTHING, token=TOKEN)
assert status in (200, 201), made
OPEN_TO_ALL = made["id"]
call("POST", "/api/admin/tournaments/%d/publish" % OPEN_TO_ALL, token=TOKEN)


def offered(registration_id, tournament=None):
    """The categories this tournament offers that athlete, as a set."""
    status, verdict = call(
        "GET", "/api/admin/tournaments/%d/eligibility/%d" % (tournament or OPEN_TO_ALL, registration_id),
        token=TOKEN)
    assert status == 200, verdict
    return {o["category"] for o in verdict["options"]}, verdict


# =========================================================================
say("=== REQ-01 rule 4: the tournament offers all eleven categories ===")

status, detail = call("GET", "/api/admin/tournaments/%d" % OPEN_TO_ALL, token=TOKEN)
check("every category the document lists can be run",
      {d["category"] for d in detail["divisions"]} == set(ALL_CATEGORIES),
      sorted({d["category"] for d in detail["divisions"]}))

status, options = call("GET", "/api/admin/tournaments/options", token=TOKEN)
check("and the setup screen offers exactly those eleven",
      [c["value"] for c in options["categories"]] == ALL_CATEGORIES,
      [c["value"] for c in options["categories"]])

check("the three Masters bands are separate, not one 'masters'",
      {"masters_35", "masters_40", "masters_45"} <= {c["value"] for c in options["categories"]}
      and "masters" not in {c["value"] for c in options["categories"]})


# =========================================================================
say("")
say("=== REQ-02 rule 1: age is the tournament year minus the birth year ===")

# Two athletes born in the same year at opposite ends of it. On a birthday
# reckoning in December they would be different ages; the document says the
# year alone decides, so they must be offered the same thing.
new_year = athlete(born_at(16, 1, 1))
new_year_eve = athlete(born_at(16, 12, 31))

first, _ = offered(new_year)
last, _ = offered(new_year_eve)
check("born 1 January and born 31 December of the same year are the same age",
      first == last == {"u18"}, "%s vs %s" % (sorted(first), sorted(last)))


# =========================================================================
say("")
say("=== REQ-02 rule 2: the eleven age bands, at both ends of each ===")

BANDS = [
    ("u8", 6, 7),
    ("u10", 8, 9),
    ("u12", 10, 11),
    ("u14", 12, 13),
    ("u16", 14, 15),
    ("u18", 16, 17),
    ("u24", 18, 23),
    ("elite", 18, 40),
    ("masters_35", 35, 39),
    ("masters_40", 40, 44),
    ("masters_45", 45, 50),
]

# Every age the eleven bands span, compared against the bands recomputed
# here from the document's own numbers rather than from the code's.
for age in range(6, 51):
    expected = {key for key, low, high in BANDS if low <= age <= high}
    got, verdict = offered(athlete(born_at(age), weight="45" if age < 12 else "60"))

    check("at %d the bands are %s" % (age, ", ".join(sorted(expected))),
          got == expected, "got %s" % (sorted(got),))

# The ends of the whole range are held by the membership itself: there is no
# category below 6 or above 50, and no membership either.
for age in (5, 51):
    payload_age = "%d-06-15" % (YEAR - age)
    st, refused = call("POST", "/api/registrations", {"type": "athlete", "payload": {
        "firstNameAr": "علي", "fatherNameAr": "محمد", "familyNameAr": "الحربي",
        "firstNameEn": "Ali", "fatherNameEn": "Mohammed", "familyNameEn": "Alzzz",
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": payload_age, "nationality": "SA", "gender": "male",
        "phone": "+966512345678", "email": "x%s@example.com" % uuid.uuid4().hex[:8],
        "region": "الرياض", "city": "الرياض", "paraAthlete": "no",
        "currentWeight": "50", "clubName": "Rules Club", "consent": True,
        "guardianName": "ولي الأمر", "guardianPhone": "+966512345670",
        "guardianRelation": "father",
    }})
    check("at %d there is no band, and no membership to enter with" % age,
          st == 400 and "dateOfBirth" in (refused.get("errors") or {}),
          (st, list((refused.get("errors") or {}).keys())))


# =========================================================================
say("")
say("=== REQ-02 dev note 3: the document's own two overlap examples ===")

eighteen, _ = offered(athlete(born_at(18)))
check("an 18-year-old is eligible for both U24 and Elite",
      eighteen == {"u24", "elite"}, sorted(eighteen))

thirty_five, _ = offered(athlete(born_at(35)))
check("a 35-year-old is eligible for both Elite and Masters 35+",
      thirty_five == {"elite", "masters_35"}, sorted(thirty_five))

# Rule 4 — where more than one is open, one is chosen, and only one.
overlap = athlete(born_at(18), weight="60")
status, entered = call("POST", "/api/admin/tournaments/%d/entries" % OPEN_TO_ALL,
                       {"athleteRegistrationId": overlap, "category": "elite",
                        "declaredWeightKg": 60, "clubName": "Rules Club"}, token=TOKEN)
check("they enter in the one they picked", status == 200, entered)
if status == 200:
    chosen = sql("select e.DivisionId, d.Category, d.Gender, d.WeightLimitKg "
                 "from TournamentEntries e left join TournamentDivisions d "
                 "on d.Id = e.DivisionId where e.Id=?", (entered["id"],))
    check("and it is the category they chose, not the other one",
          bool(chosen) and chosen[0][1] == "elite", chosen)

status, twice = call("POST", "/api/admin/tournaments/%d/entries" % OPEN_TO_ALL,
                     {"athleteRegistrationId": overlap, "category": "u24",
                      "declaredWeightKg": 60, "clubName": "Rules Club"}, token=TOKEN)
check("they cannot also enter the other category (REQ-02 AC)", twice == 409 or status == 409, twice)


# =========================================================================
say("")
say("=== REQ-03 rule 11: the same athlete, two tournaments, two divisions ===")

second = dict(EVERYTHING)
second.update({"nameEn": "Rules Championship II", "nameAr": "بطولة القواعد ٢",
               "startDate": "%d-12-20" % YEAR, "endDate": "%d-12-20" % YEAR,
               "registrationClosesAt": "%d-12-15T00:00:00" % YEAR})
status, other = call("POST", "/api/admin/tournaments", second, token=TOKEN)
OTHER_TOURNAMENT = other["id"]
call("POST", "/api/admin/tournaments/%d/publish" % OTHER_TOURNAMENT, token=TOKEN)

status, again = call("POST", "/api/admin/tournaments/%d/entries" % OTHER_TOURNAMENT,
                     {"athleteRegistrationId": overlap, "category": "u24",
                      "declaredWeightKg": 63, "clubName": "Rules Club"}, token=TOKEN)
check("the same athlete may enter a second tournament", status == 200, again)
if status == 200:
    both = sql("select e.TournamentId, d.Category, d.WeightLimitKg "
               "from TournamentEntries e left join TournamentDivisions d "
               "on d.Id = e.DivisionId where e.AthleteRegistrationId=? order by e.Id", (overlap,))
    check("in a different division, because eligibility allows it",
          len(both) == 2 and both[0][1:] != both[1][1:], both)


# =========================================================================
say("")
say("=== REQ-03 rule 7: the technical team changes a class after registration ===")

mover = athlete(born_at(16), weight="50")
status, entry = call("POST", "/api/admin/tournaments/%d/entries" % OPEN_TO_ALL,
                     {"athleteRegistrationId": mover, "category": "u18",
                      "declaredWeightKg": 50, "clubName": "Rules Club"}, token=TOKEN)
check("an athlete is entered", status == 200, entry)
ENTRY = entry["id"]

was = sql("select d.Category, d.WeightLimitKg from TournamentEntries e "
          "join TournamentDivisions d on d.Id = e.DivisionId where e.Id=?", (ENTRY,))[0]

status, divisions = call("GET", "/api/admin/tournaments/%d" % OPEN_TO_ALL, token=TOKEN)
target = next(d for d in divisions["divisions"]
              if d["category"] == "u18" and d["gender"] == "male"
              and str(d["weightLimitKg"]) == "54.0")

status, moved = call("PUT", "/api/admin/tournaments/entries/%d" % ENTRY,
                     {"divisionId": target["id"]}, token=TOKEN)
check("the technical team can move them to another class", status == 200, moved)

now = sql("select d.Category, d.WeightLimitKg from TournamentEntries e "
          "join TournamentDivisions d on d.Id = e.DivisionId where e.Id=?", (ENTRY,))[0]
check("and the entry now reads the new class",
      str(now[1]) == "54.0" and now != was, "%s -> %s" % (was, now))


# =========================================================================
say("")
say("=== REQ-08 rule 7: a Failed examination stops the athlete there ===")

sick = athlete(born_at(16), weight="50")
status, entry = call("POST", "/api/admin/tournaments/%d/entries" % OPEN_TO_ALL,
                     {"athleteRegistrationId": sick, "category": "u18", "declaredWeightKg": 50,
                      "clubName": "Rules Club"}, token=TOKEN)
SICK = entry["id"]

call("POST", "/api/admin/tournaments/entries/%d/check-in" % SICK, token=TOKEN)
status, failed = call("POST", "/api/admin/tournaments/entries/%d/medical" % SICK,
                      {"result": "failed", "note": "Not fit.", "documentsMissing": False},
                      token=TOKEN)
check("a Failed examination is recorded", status == 200, failed)

status, weighed = call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % SICK,
                       {"weightKg": 50, "result": "passed", "noShow": False}, token=TOKEN)
check("they cannot go on to the weigh-in", status in (400, 409), weighed)

status, approved = call("POST", "/api/admin/tournaments/entries/%d/approve" % SICK, token=TOKEN)
check("and they cannot be approved for the draw", status in (400, 409), approved)


# =========================================================================
say("")
say("=== REQ-09 rules 4, 5 and dev note 6: the weigh-in decides the class ===")

heavy = athlete(born_at(16), weight="50")
status, entry = call("POST", "/api/admin/tournaments/%d/entries" % OPEN_TO_ALL,
                     {"athleteRegistrationId": heavy, "category": "u18", "declaredWeightKg": 50,
                      "clubName": "Rules Club"}, token=TOKEN)
HEAVY = entry["id"]
registered = sql("select DivisionId from TournamentEntries where Id=?", (HEAVY,))[0][0]

call("POST", "/api/admin/tournaments/entries/%d/check-in" % HEAVY, token=TOKEN)
call("POST", "/api/admin/tournaments/entries/%d/medical" % HEAVY,
     {"result": "passed", "note": None, "documentsMissing": False}, token=TOKEN)

status, preview = call(
    "GET", "/api/admin/tournaments/entries/%d/weigh-in/preview?weightKg=56" % HEAVY, token=TOKEN)
check("a weight outside the class is reported as outside",
      preview["withinRegisteredClass"] is False, preview)
check("and only classes of their own gender and category are offered (rule 5)",
      len(preview["alternatives"]) > 0
      and all("U18" in a["labelEn"] or "Male" in a["labelEn"] for a in preview["alternatives"]),
      [a["labelEn"] for a in preview["alternatives"]][:3])

status, over = call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % HEAVY,
                    {"weightKg": 56, "result": "passed", "noShow": False}, token=TOKEN)
check("Passed is not available while they are over (rule 4)", status in (400, 409), over)

landed = next(a for a in preview["alternatives"] if "57" in a["labelEn"])
status, shifted = call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % HEAVY,
                       {"weightKg": 56, "result": "passed", "noShow": False,
                        "moveToDivisionId": landed["id"]}, token=TOKEN)
check("moving them to the class they made is allowed", status == 200, shifted)

check("and their registered class is updated to it (dev note 6)",
      sql("select DivisionId from TournamentEntries where Id=?", (HEAVY,))[0][0] == landed["id"]
      != registered,
      sql("select DivisionId from TournamentEntries where Id=?", (HEAVY,))[0][0])

# Rule 5 — Failed at the weigh-in ends it.
light = athlete(born_at(16), weight="50")
status, entry = call("POST", "/api/admin/tournaments/%d/entries" % OPEN_TO_ALL,
                     {"athleteRegistrationId": light, "category": "u18", "declaredWeightKg": 50,
                      "clubName": "Rules Club"}, token=TOKEN)
LIGHT = entry["id"]
call("POST", "/api/admin/tournaments/entries/%d/check-in" % LIGHT, token=TOKEN)
call("POST", "/api/admin/tournaments/entries/%d/medical" % LIGHT,
     {"result": "passed", "note": None, "documentsMissing": False}, token=TOKEN)
call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % LIGHT,
     {"weightKg": 56, "result": "failed", "noShow": False}, token=TOKEN)

status, approved = call("POST", "/api/admin/tournaments/entries/%d/approve" % LIGHT, token=TOKEN)
check("a Failed weigh-in cannot be approved for the draw (rule 5)",
      status in (400, 409), approved)


# =========================================================================
say("")
say("=== REQ-01 rule 9: the closing date can be extended ===")

status, before = call("GET", "/api/admin/tournaments/%d" % OPEN_TO_ALL, token=TOKEN)
later = dict(EVERYTHING)
later["registrationClosesAt"] = "%d-12-08T00:00:00" % YEAR
status, extended = call("PUT", "/api/admin/tournaments/%d" % OPEN_TO_ALL, later, token=TOKEN)
check("an authorised user can push the closing date out", status == 200, extended)

status, after = call("GET", "/api/admin/tournaments/%d" % OPEN_TO_ALL, token=TOKEN)
check("and the new date is what the tournament now runs to",
      after["tournament"]["registrationClosesAt"].startswith("%d-12-08" % YEAR),
      after["tournament"]["registrationClosesAt"])


# =========================================================================
say("")
say("=== REQ-10 rule 7: withdrawing before the draw leaves no trace in it ===")

leaver = athlete(born_at(16), weight="60")
status, entry = call("POST", "/api/admin/tournaments/%d/entries" % OPEN_TO_ALL,
                     {"athleteRegistrationId": leaver, "category": "u18", "declaredWeightKg": 60,
                      "clubName": "Rules Club"}, token=TOKEN)
LEAVER = entry["id"]
DIVISION = sql("select DivisionId from TournamentEntries where Id=?", (LEAVER,))[0][0]

stayers = []
for index in range(2):
    rid = athlete(born_at(16), weight="60", club="Other %d" % index)
    st, e = call("POST", "/api/admin/tournaments/%d/entries" % OPEN_TO_ALL,
                 {"athleteRegistrationId": rid, "divisionId": DIVISION,
                  "declaredWeightKg": 60, "clubName": "Other %d" % index}, token=TOKEN)
    if st == 200:
        stayers.append(e["id"])

for e in [LEAVER, *stayers]:
    call("POST", "/api/admin/tournaments/entries/%d/check-in" % e, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/medical" % e,
         {"result": "passed", "note": None, "documentsMissing": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % e,
         {"weightKg": 60, "result": "passed", "noShow": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/approve" % e, token=TOKEN)

status, withdrawn = call("POST", "/api/admin/tournaments/entries/%d/withdraw" % LEAVER,
                         {"reason": "Injured in training."}, token=TOKEN)
check("an athlete withdraws before the draw is made", status == 200, withdrawn)

status, drawn = call("POST", "/api/admin/tournaments/divisions/%d/draw" % DIVISION,
                     {"seed": 3}, token=TOKEN)
check("the division still draws", status == 200, drawn)

in_draw = sql("select RedEntryId from Bouts where DivisionId=? union "
              "select BlueEntryId from Bouts where DivisionId=?", (DIVISION, DIVISION))
check("and the one who withdrew is simply not in it (rule 7)",
      LEAVER not in [row[0] for row in in_draw], [row[0] for row in in_draw])
check("no walkover was invented for them",
      sql("select count(*) from Bouts where DivisionId=? and IsWalkover=1", (DIVISION,))[0][0] == 0)


# =========================================================================
say("")
say("=== REQ-06 rule 4: a coach enters an athlete, which nothing had driven ===")


def latin():
    return "".join(chr(97 + (b % 26)) for b in uuid.uuid4().bytes[:5])


club_payload = {
    "firstNameAr": "خالد", "fatherNameAr": "علي", "familyNameAr": "الدوسري",
    "firstNameEn": "Khalid", "fatherNameEn": "Ali", "familyNameEn": "Al" + latin(),
    "applicantRole": "owner", "applicantId": "1" + str(uuid.uuid4().int)[:9],
    "nationality": "SA", "applicantPhone": "+966512345678",
    "applicantEmail": "app%s@example.com" % uuid.uuid4().hex[:8],
    "officialEmail": "club%s@example.com" % uuid.uuid4().hex[:8],
    "region": "الرياض", "city": "الرياض",
    "nameAr": "نادي القواعد", "nameEn": "Rules Club " + latin(),
    "entityType": "club", "ownerName": "Khalid", "headCoachName": "Coach",
    "headCoachPhone": "+966512345679",
    "googleMapsUrl": "https://maps.google.com/?q=riyadh", "consent": True,
}
st, created = call("POST", "/api/registrations", {"type": "club", "payload": club_payload})
assert st == 200, created
CLUB_ID = sql("select Id from Registrations where ReferenceNumber=?",
              (created["referenceNumber"],))[0][0]
for step in ("under_review", "awaiting_approval"):
    call("PUT", "/api/admin/registrations/%d/status" % CLUB_ID, {"status": step}, token=TOKEN)
call("PUT", "/api/admin/registrations/%d/status" % CLUB_ID,
     {"status": "approved", "membershipNumber": "SMF-RC-%d" % CLUB_ID}, token=TOKEN)


def activate(email, kind, registration_id, club_registration_id=None, password="RulesPass2026"):
    status, invited = call("POST", "/api/admin/member-accounts/invite", {
        "email": email, "kind": kind, "registrationId": registration_id,
        "clubRegistrationId": club_registration_id, "displayName": "Rules " + kind,
    }, token=TOKEN)
    assert status == 200, invited
    link = invited.get("activationLink")
    assert link, invited
    status, signed = call("POST", "/api/member/activate",
                          {"token": link.split("token=")[1], "password": password})
    assert status == 200, signed
    return signed["token"]


CLUB = activate(club_payload["officialEmail"], "club", CLUB_ID)

# A coach of that club, and an athlete on its roster.
coach_email = "coach%s@example.com" % uuid.uuid4().hex[:8]
coach_payload = {
    "firstNameAr": "سعد", "fatherNameAr": "علي", "familyNameAr": "الزهراني",
    "firstNameEn": "Saad", "fatherNameEn": "Ali", "familyNameEn": "Al" + latin(),
    "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
    "dateOfBirth": "1990-03-03", "nationality": "SA", "gender": "male",
    "phone": "+966512345678", "email": coach_email,
    "region": "الرياض", "city": "الرياض", "clubName": club_payload["nameEn"],
    "consent": True,
}
st, made_coach = call("POST", "/api/registrations", {"type": "coach", "payload": coach_payload})
assert st == 200, made_coach
COACH_ID = sql("select Id from Registrations where ReferenceNumber=?",
               (made_coach["referenceNumber"],))[0][0]
for step in ("under_review", "awaiting_approval"):
    call("PUT", "/api/admin/registrations/%d/status" % COACH_ID, {"status": step}, token=TOKEN)
call("PUT", "/api/admin/registrations/%d/status" % COACH_ID,
     {"status": "approved", "membershipNumber": "SMF-RK-%d" % COACH_ID}, token=TOKEN)

COACH = activate(coach_email, "coach", COACH_ID, club_registration_id=CLUB_ID)

roster_email = "ath%s@example.com" % uuid.uuid4().hex[:8]
ROSTER_ATHLETE = athlete(born_at(16), weight="60",
                         club=club_payload["nameEn"], email=roster_email)
status, added = call("POST", "/api/member/roster/invite",
                     {"email": roster_email, "kind": "athlete",
                      "registrationId": ROSTER_ATHLETE, "displayName": "Ali"}, token=CLUB)
check("the club puts an athlete on its roster", status == 200, added)

status, seen = call("GET", "/api/member/roster", token=COACH)
check("the coach sees them (rule 2)",
      any(a.get("registrationId") == ROSTER_ATHLETE for a in seen.get("athletes", [])),
      [a.get("registrationId") for a in seen.get("athletes", [])])

status, listed = call("GET", "/api/member/tournaments/%d/eligible" % OPEN_TO_ALL, token=COACH)
check("the coach is shown which of them may enter (rule 4)", status == 200, status)
candidate = next((a for a in (listed or []) if a.get("canEnter")), None)
check("and at least one can", candidate is not None,
      [(a.get("registrationId"), a.get("canEnter")) for a in (listed or [])])

if candidate:
    division = candidate["options"][0]["divisions"][0]["divisionId"]
    status, by_coach = call("POST", "/api/member/tournaments/%d/entries" % OPEN_TO_ALL,
                            {"athleteRegistrationId": candidate["registrationId"],
                             "divisionId": division, "declaredWeightKg": 60}, token=COACH)
    check("the coach enters them, which no test had ever done", status == 200, by_coach)

    check("the entry is recorded against the athlete",
          sql("select count(*) from TournamentEntries where TournamentId=? and "
              "AthleteRegistrationId=?", (OPEN_TO_ALL, candidate["registrationId"]))[0][0] == 1)

    status, duplicate = call("POST", "/api/member/tournaments/%d/entries" % OPEN_TO_ALL,
                             {"athleteRegistrationId": candidate["registrationId"],
                              "divisionId": division, "declaredWeightKg": 60}, token=COACH)
    check("and cannot enter them twice (rule 5)", duplicate == 409 or status == 409, duplicate)

status, refused = call("POST", "/api/member/roster/invite",
                       {"email": "someone%s@example.com" % uuid.uuid4().hex[:6], "kind": "athlete"},
                       token=COACH)
check("a coach still cannot invite anybody (rule 2)", status == 403, status)


# =========================================================================
say("")
say("=== REQ-01 dev note 7: adding a category group leaves the others alone ===")

grouped = dict(EVERYTHING)
grouped.update({"nameEn": "Groups Championship", "nameAr": "بطولة المجموعات",
                "categories": ["u18"], "genders": ["male"],
                "weightClasses": {"u18:male": [48, 51]}})
status, groups = call("POST", "/api/admin/tournaments", grouped, token=TOKEN)
GROUPED = groups["id"]

status, one = call("GET", "/api/admin/tournaments/%d" % GROUPED, token=TOKEN)
check("one group runs the two classes it picked",
      sorted(float(d["weightLimitKg"]) for d in one["divisions"]) == [48.0, 51.0],
      [d["weightLimitKg"] for d in one["divisions"]])

# A second group, with its own classes. The first must come through untouched.
grouped["categories"] = ["u18", "u16"]
grouped["weightClasses"] = {"u18:male": [48, 51], "u16:male": [40, 42, 45]}
status, widened = call("PUT", "/api/admin/tournaments/%d" % GROUPED, grouped, token=TOKEN)
check("a second group is added", status == 200, widened)

status, two = call("GET", "/api/admin/tournaments/%d" % GROUPED, token=TOKEN)
u18 = sorted(float(d["weightLimitKg"]) for d in two["divisions"] if d["category"] == "u18")
u16 = sorted(float(d["weightLimitKg"]) for d in two["divisions"] if d["category"] == "u16")

check("the first group still runs exactly what it ran", u18 == [48.0, 51.0], u18)
check("and the second runs its own three", u16 == [40.0, 42.0, 45.0], u16)
check("nothing else crept in", len(two["divisions"]) == 5, len(two["divisions"]))


# =========================================================================
say("")
say("=== REQ-03 rule 10: no limit on how many a club brings ===")

many = dict(EVERYTHING)
many.update({"nameEn": "Crowd Championship", "nameAr": "بطولة الحشد",
             "categories": ["u18"], "genders": ["male"],
             "weightClasses": {"u18:male": [60]}})
status, crowd = call("POST", "/api/admin/tournaments", many, token=TOKEN)
CROWD = crowd["id"]
call("POST", "/api/admin/tournaments/%d/publish" % CROWD, token=TOKEN)

status, crowd_detail = call("GET", "/api/admin/tournaments/%d" % CROWD, token=TOKEN)
CROWD_DIVISION = crowd_detail["divisions"][0]["id"]

accepted = 0
for index in range(12):
    rid = athlete(born_at(16), weight="58", club="One Big Club")
    st, _ = call("POST", "/api/admin/tournaments/%d/entries" % CROWD,
                 {"athleteRegistrationId": rid, "divisionId": CROWD_DIVISION,
                  "declaredWeightKg": 58, "clubName": "One Big Club"}, token=TOKEN)
    if st == 200:
        accepted += 1

check("twelve athletes from one club all get in", accepted == 12, accepted)
check("and the tournament imposes no ceiling of its own",
      sql("select count(*) from TournamentEntries where TournamentId=?", (CROWD,))[0][0] == 12)


# =========================================================================
say("")
say("=== REQ-08 rule 3: the desk completes a document that is missing ===")

late = athlete(born_at(16), weight="60")
status, file_before = call("GET", "/api/admin/athletes/%d/medical" % late, token=TOKEN)
check("the file starts with the certificate missing", status == 200
      and any("certificate" in m["en"].lower() for m in file_before["missing"]),
      [m["en"] for m in file_before["missing"]])

status, filled = call("PUT", "/api/admin/athletes/%d/medical" % late, {
    "certificateAttachmentId": "desk-upload-%s" % uuid.uuid4().hex[:8],
    "certificateDate": "%d-10-01" % YEAR,
}, token=TOKEN)
check("the desk can attach it during the examination", status == 200, filled)

status, file_after = call("GET", "/api/admin/athletes/%d/medical" % late, token=TOKEN)
check("and the certificate stops being listed as missing",
      not any("certificate" in m["en"].lower() for m in file_after["missing"]),
      [m["en"] for m in file_after["missing"]])


say("")
say("=" * 60)
say("FAILED: " + (", ".join(failures) if failures else "none"))
LOG_PATH = os.environ.get("SMF_TEST_LOG")
if LOG_PATH:
    open(LOG_PATH, "w", encoding="utf-8").write("\n".join(log) + "\n")
sys.exit(1 if failures else 0)
