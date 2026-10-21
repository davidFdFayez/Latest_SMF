"""
The seven Phase 3 rules that the first pass left implied rather than operable.

Each one was a rule the signed document states plainly and the system could
not actually carry out: a list the federation may extend, a tournament that
runs only the classes it picked, a consent form a desk can hand over, a
corner that can be swapped, a division with its own start time. They are
grouped here because they were closed together, not because they belong
together.
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


def call(method, path, body=None, token=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    head = {"Content-Type": "application/json"} if data else {}
    if token:
        head["Authorization"] = "Bearer " + token
    req = urllib.request.Request(API + path, data=data, method=method, headers=head)
    try:
        with urllib.request.urlopen(req) as response:
            text = response.read().decode("utf-8", "replace")
            if raw:
                return response.status, text
            return response.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", "replace")
        if raw:
            return error.code, text
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


def make_athlete(age, gender="male", weight="60", club="Gap Club"):
    """An approved athlete membership, which is what entry requires."""
    payload = {
        "firstNameAr": "علي", "fatherNameAr": "محمد", "familyNameAr": "الحربي",
        "firstNameEn": "Ali", "fatherNameEn": "Mohammed",
        "familyNameEn": "Al" + "".join(chr(97 + (b % 26)) for b in uuid.uuid4().bytes[:5]),
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": "%d-06-15" % (YEAR - age), "nationality": "SA", "gender": gender,
        "phone": "+966512345678", "email": "g%s@example.com" % uuid.uuid4().hex[:8],
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
         {"status": "approved", "membershipNumber": "SMF-G-%d" % rid}, token=TOKEN)
    return rid


# =========================================================================
say("=== REQ-01 rules 2, 3 and 7: the lists are the federation's to extend ===")

status, options = call("GET", "/api/admin/tournaments/options", token=TOKEN)
check("the options come from the table", status == 200, status)

seeded_types = [t for t in options["types"] if t["isSeeded"]]
check("the document's own tournament types are seeded",
      {"kingdom", "regional", "local"} <= {t["value"] for t in seeded_types},
      [t["value"] for t in seeded_types])
seeded_competitions = {t["value"] for t in options["competitionTypes"] if t["isSeeded"]}
check("the document's own competition types are seeded",
      {"muaythai_combat", "full_contact"} <= seeded_competitions,
      sorted(seeded_competitions))

label = "Gulf Invitational " + uuid.uuid4().hex[:6]
status, added = call("POST", "/api/admin/tournaments/options/tournament_type",
                     {"nameAr": "بطولة الخليج الدعوية", "nameEn": label}, token=TOKEN)
check("rule 2 - a new tournament type is accepted", status == 200, added)
NEW_TYPE = added["value"] if status == 200 else None
check("its stored value is a slug of the English name",
      bool(NEW_TYPE) and NEW_TYPE.startswith("gulf_invitational_"), NEW_TYPE)

status, _ = call("POST", "/api/admin/tournaments/options/tournament_type",
                 {"nameAr": "مرة أخرى", "nameEn": label}, token=TOKEN)
check("the same one twice is refused", status == 409, status)

status, _ = call("POST", "/api/admin/tournaments/options/tournament_type",
                 {"nameAr": "", "nameEn": "Only English"}, token=TOKEN)
check("a name is needed in both languages", status == 400, status)

status, _ = call("POST", "/api/admin/tournaments/options/not_a_list",
                 {"nameAr": "س", "nameEn": "X"}, token=TOKEN)
check("an unknown list is refused", status == 400, status)

status, comp = call("POST", "/api/admin/tournaments/options/competition_type",
                    {"nameAr": "واي كرو", "nameEn": "Wai Kru " + uuid.uuid4().hex[:6]}, token=TOKEN)
check("rule 3 - a new competition type is accepted", status == 200, comp)
NEW_COMP = comp["value"] if status == 200 else None

status, options = call("GET", "/api/admin/tournaments/options", token=TOKEN)
check("both now appear in the lists",
      any(t["value"] == NEW_TYPE for t in options["types"])
      and any(t["value"] == NEW_COMP for t in options["competitionTypes"]),
      NEW_TYPE)
check("and are not marked as the document's own",
      not next(t for t in options["types"] if t["value"] == NEW_TYPE)["isSeeded"])


# rule 7 - the system's existing rules apply unchanged to whatever is added.
def setup_body(**over):
    body = {
        "nameAr": "بطولة الفجوات", "nameEn": "Gap Championship",
        "type": NEW_TYPE, "competitionType": NEW_COMP,
        "locationAr": "جدة", "locationEn": "Jeddah",
        "startDate": "%d-11-10" % YEAR, "endDate": "%d-11-11" % YEAR,
        "firstBoutTime": "17:00:00", "boutIntervalMinutes": 10,
        "registrationOpensAt": "%d-01-01T00:00:00" % YEAR,
        "registrationClosesAt": "%d-11-01T00:00:00" % YEAR,
        "genders": ["male"], "categories": ["u18"],
    }
    body.update(over)
    return body


status, made = call("POST", "/api/admin/tournaments", setup_body(), token=TOKEN)
check("rule 7 - a tournament runs on the added types", status in (200, 201), made)
TOURNAMENT = made["id"]

status, refused = call("POST", "/api/admin/tournaments",
                       setup_body(type="invented_on_the_spot"), token=TOKEN)
check("a type nobody added is still refused", status == 400, refused)

seeded = next(t for t in options["types"] if t["isSeeded"])
rows = sql("select Id from TournamentLookups where Value=? and Kind='tournament_type'",
           (seeded["value"],))
status, _ = call("POST", "/api/admin/tournaments/options/%d/active" % rows[0][0],
                 {"isActive": False}, token=TOKEN)
check("a seeded option cannot be hidden - tournaments refer to it", status == 409, status)

rows = sql("select Id from TournamentLookups where Value=?", (NEW_TYPE,))
LOOKUP_ID = rows[0][0]
status, _ = call("POST", "/api/admin/tournaments/options/%d/active" % LOOKUP_ID,
                 {"isActive": False}, token=TOKEN)
check("one the federation added can be taken out of use", status == 200, status)

status, options = call("GET", "/api/admin/tournaments/options", token=TOKEN)
check("and then stops being offered",
      not any(t["value"] == NEW_TYPE for t in options["types"]))

status, _ = call("POST", "/api/admin/tournaments", setup_body(nameEn="Later"), token=TOKEN)
check("a withdrawn type cannot start a new tournament", status == 400, status)

call("POST", "/api/admin/tournaments/options/%d/active" % LOOKUP_ID, {"isActive": True}, token=TOKEN)
check("the tournament already created keeps its type",
      sql("select Type from Tournaments where Id=?", (TOURNAMENT,))[0][0] == NEW_TYPE)


# =========================================================================
say("")
say("=== REQ-01 rule 6: a tournament runs the classes it picked ===")

status, offered = call("GET", "/api/admin/tournaments/weight-classes?category=u18&gender=male",
                       token=TOKEN)
check("the ladder for a pairing is readable", status == 200 and len(offered) > 3, len(offered or []))

status, detail = call("GET", "/api/admin/tournaments/%d" % TOURNAMENT, token=TOKEN)
check("picking none runs all of them", len(detail["divisions"]) == len(offered),
      "%d divisions, %d classes" % (len(detail["divisions"]), len(offered)))

two = [offered[0]["limitKg"], offered[1]["limitKg"]]
status, _ = call("PUT", "/api/admin/tournaments/%d" % TOURNAMENT,
                 setup_body(weightClasses={"u18:male": two}), token=TOKEN)
check("a selection is accepted", status == 200, status)

status, detail = call("GET", "/api/admin/tournaments/%d" % TOURNAMENT, token=TOKEN)
check("and only those divisions remain", len(detail["divisions"]) == 2,
      [d["weightLimitKg"] for d in detail["divisions"]])
check("the chosen limits are the ones picked",
      sorted(float(d["weightLimitKg"]) for d in detail["divisions"]) == sorted(float(v) for v in two),
      [d["weightLimitKg"] for d in detail["divisions"]])
check("the selection survives a reload",
      [float(v) for v in (detail.get("weightClasses") or {}).get("u18:male", [])]
      == [float(v) for v in two],
      detail.get("weightClasses"))

# A division that already has an entry is not swept away by a later edit.
DIVISION = next(d["id"] for d in detail["divisions"] if float(d["weightLimitKg"]) == float(two[0]))
INSIDE = float(two[0]) - 0.5
ATHLETE = make_athlete(16, weight=str(INSIDE))

status, opened = call("POST", "/api/admin/tournaments/%d/publish" % TOURNAMENT, token=TOKEN)
check("the tournament is published so entries can arrive", status == 200, opened)

status, entered = call("POST", "/api/admin/tournaments/%d/entries" % TOURNAMENT,
                       {"athleteRegistrationId": ATHLETE, "divisionId": DIVISION,
                        "declaredWeightKg": INSIDE, "clubName": "Gap Club"}, token=TOKEN)
check("an athlete enters one of the chosen divisions", status == 200, entered)

status, kept = call("PUT", "/api/admin/tournaments/%d" % TOURNAMENT,
                    setup_body(weightClasses={"u18:male": [two[1]]}), token=TOKEN)
check("dropping a class that has an entry is refused", status in (400, 409), kept)

status, detail = call("GET", "/api/admin/tournaments/%d" % TOURNAMENT, token=TOKEN)
check("so the division is still there",
      any(d["id"] == DIVISION for d in detail["divisions"]),
      [d["id"] for d in detail["divisions"]])


# =========================================================================
say("")
say("=== REQ-04 rule 3: the guardian consent form is a document ===")

MINOR = make_athlete(15)
status, form = call("GET", "/api/admin/athletes/%d/medical/guardian-consent" % MINOR,
                    token=TOKEN, raw=True)
check("a desk can print the form for a minor", status == 200, status)
check("it is a page, not JSON", isinstance(form, str) and "<html" in form.lower())
check("it names the athlete", ("SMF-G-%d" % MINOR) in form or "علي" in form)
check("it asks the guardian to sign", "ولي" in form)
check("a boy's form has no pregnancy declaration", "حمل" not in form)

GIRL = make_athlete(15, gender="female", weight="48")
status, girls = call("GET", "/api/admin/athletes/%d/medical/guardian-consent" % GIRL,
                     token=TOKEN, raw=True)
check("a girl's form adds the pregnancy declaration", status == 200 and "حمل" in girls, status)

status, _ = call("GET", "/api/admin/athletes/999999/medical/guardian-consent", token=TOKEN)
check("an athlete who does not exist has no form", status == 404, status)

status, _ = call("GET", "/api/admin/athletes/%d/medical/guardian-consent" % MINOR)
check("and it is not public", status in (401, 403), status)


# =========================================================================
say("")
say("=== REQ-10 rule 6 and REQ-11 rule 17: corners, start times, intervals ===")

ready = [entered["id"]] if entered and isinstance(entered, dict) and "id" in entered else []
for index in range(3):
    rid = make_athlete(16, weight=str(INSIDE))
    st, e = call("POST", "/api/admin/tournaments/%d/entries" % TOURNAMENT,
                 {"athleteRegistrationId": rid, "divisionId": DIVISION,
                  "declaredWeightKg": INSIDE, "clubName": "Club %d" % index}, token=TOKEN)
    if st == 200:
        ready.append(e["id"])
check("there are four in the division to draw", len(ready) == 4, len(ready))

for entry in ready:
    call("POST", "/api/admin/tournaments/entries/%d/check-in" % entry, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/medical" % entry,
         {"result": "passed", "note": None, "documentsMissing": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/weigh-in" % entry,
         {"weightKg": INSIDE, "result": "passed", "noShow": False}, token=TOKEN)
    call("POST", "/api/admin/tournaments/entries/%d/approve" % entry, token=TOKEN)

qualified = sql(
    "select count(*) from TournamentEntries where DivisionId=? and Status='qualified'", (DIVISION,))
check("all four are qualified for the draw", qualified[0][0] == 4, qualified[0][0])

status, drawn = call("POST", "/api/admin/tournaments/divisions/%d/draw" % DIVISION,
                     {"seed": 4242}, token=TOKEN)
check("the division draws", status == 200, drawn)

bouts = sql("select Id, RedEntryId, BlueEntryId from Bouts where DivisionId=? order by Id", (DIVISION,))
contested = [b for b in bouts if b[1] is not None and b[2] is not None]
check("there is a bout with two athletes in it", len(contested) >= 1, len(bouts))

bout_id, red, blue = contested[0]
status, swapped = call("PUT", "/api/admin/tournaments/bouts/%d/corner" % bout_id,
                       {"corner": "red", "entryId": blue, "reason": "a jury decision"}, token=TOKEN)
check("rule 6 - a corner can be reassigned", status == 200, swapped)
after = sql("select RedEntryId, BlueEntryId from Bouts where Id=?", (bout_id,))[0]
check("the two athletes changed places", tuple(after) == (blue, red),
      "%s then %s" % ((red, blue), tuple(after)))
check("the reason is on the record",
      len(sql("select 1 from AuditLog where Details like ?", ("%jury decision%",))) >= 1)

status, _ = call("PUT", "/api/admin/tournaments/bouts/%d/corner" % bout_id,
                 {"corner": "purple", "entryId": red, "reason": "x"}, token=TOKEN)
check("a corner that is not red or blue is refused", status == 400, status)

status, published = call("POST", "/api/admin/tournaments/divisions/%d/draw/publish" % DIVISION,
                        token=TOKEN)
check("the draw is published, which is what lets it be scheduled", status == 200, published)

status, ring = call("POST", "/api/admin/tournaments/%d/rings" % TOURNAMENT,
                    {"name": "Ring A", "firstBoutTime": "18:00:00", "intervalMinutes": 12},
                    token=TOKEN)
check("a ring carries its own start time and interval", status == 200, ring)
RING = ring["id"] if status == 200 else None

status, scheduled = call("PUT", "/api/admin/tournaments/divisions/%d/schedule" % DIVISION,
                         {"ringId": RING, "date": "%d-11-10" % YEAR,
                          "firstBoutTime": "19:30:00", "intervalMinutes": 7}, token=TOKEN)
check("rule 17 - so does a division, overriding the ring", status == 200, scheduled)

row = sql("select FirstBoutTime, BoutIntervalMinutes from TournamentDivisions where Id=?",
          (DIVISION,))[0]
check("both are stored on the division", "19:30" in str(row[0]) and row[1] == 7, row)

status, plan = call("POST", "/api/admin/tournaments/%d/schedule/generate" % TOURNAMENT, {}, token=TOKEN)
check("the running order is generated", status == 200, plan)

slots = sql(
    "select StartTime from Bouts where DivisionId=? and StartTime is not null order by OrderInRing",
    (DIVISION,))
check("it starts when the division says, not when the ring says",
      len(slots) > 0 and str(slots[0][0]).startswith("19:30"), slots[:3])


def minutes(value):
    hours, mins = str(value).split(":")[:2]
    return int(hours) * 60 + int(mins)


if len(slots) > 1:
    check("and steps by the division's own interval",
          minutes(slots[1][0]) - minutes(slots[0][0]) == 7,
          "%s then %s" % (slots[0][0], slots[1][0]))


# =========================================================================
say("")
say("=== REQ-05 and REQ-06 rule 3: an athlete's row is not public ===")

status, _ = call("GET", "/api/member/athletes/%d" % ATHLETE)
check("opening an athlete needs a member token", status in (401, 403), status)

status, _ = call("GET", "/api/member/athletes/%d" % ATHLETE, token=TOKEN)
check("and the console's token is not one of those", status in (401, 403), status)

say("")
say("=" * 60)
say("FAILED: " + (", ".join(failures) if failures else "none"))
# A copy of the run, if somewhere to put it was named.
LOG_PATH = os.environ.get("SMF_TEST_LOG")
if LOG_PATH:
    open(LOG_PATH, "w", encoding="utf-8").write("\n".join(log) + "\n")
sys.exit(1 if failures else 0)
