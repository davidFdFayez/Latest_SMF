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
# The tournament's dates follow today's, so the suite does not stop working on
# the day a fixed closing date passes; ages follow the tournament's own year.
START = datetime.date.today() + datetime.timedelta(days=30)
CLOSES = datetime.date.today() + datetime.timedelta(days=20)
LATER_CLOSE = datetime.date.today() + datetime.timedelta(days=25)
TOURNAMENT_YEAR = START.year
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
        "dateOfBirth": "%d-06-15" % (TOURNAMENT_YEAR - age), "nationality": "SA", "gender": gender,
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
        "startDate": START.isoformat(), "endDate": (START + datetime.timedelta(days=1)).isoformat(),
        "firstBoutTime": "17:00:00", "boutIntervalMinutes": 10,
        "registrationOpensAt": "%d-01-01T00:00:00" % YEAR,
        "registrationClosesAt": CLOSES.isoformat() + "T00:00:00",
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
# The second class: the first has no approved weigh-in minimum, so its athletes cannot pass yet.
DIVISION = next(d["id"] for d in detail["divisions"] if float(d["weightLimitKg"]) == float(two[1]))
INSIDE = float(two[1]) - 0.5
ATHLETE = make_athlete(16, weight=str(INSIDE))

status, opened = call("POST", "/api/admin/tournaments/%d/publish" % TOURNAMENT, token=TOKEN)
check("the tournament is published so entries can arrive", status == 200, opened)

status, entered = call("POST", "/api/admin/tournaments/%d/entries" % TOURNAMENT,
                       {"athleteRegistrationId": ATHLETE, "divisionId": DIVISION,
                        "declaredWeightKg": INSIDE, "clubName": "Gap Club"}, token=TOKEN)
check("an athlete enters one of the chosen divisions", status == 200, entered)

status, kept = call("PUT", "/api/admin/tournaments/%d" % TOURNAMENT,
                    setup_body(weightClasses={"u18:male": [two[0]]}), token=TOKEN)
check("dropping a class that has an entry is refused", status in (400, 409), kept)

status, detail = call("GET", "/api/admin/tournaments/%d" % TOURNAMENT, token=TOKEN)
check("so the division is still there",
      any(d["id"] == DIVISION for d in detail["divisions"]),
      [d["id"] for d in detail["divisions"]])

# The console sets categories up as separate groups - gender, category,
# classes - so a pairing no group names is not run at all.
status, elite_m = call("GET", "/api/admin/tournaments/weight-classes?category=elite&gender=male", token=TOKEN)
status, u18_f = call("GET", "/api/admin/tournaments/weight-classes?category=u18&gender=female", token=TOKEN)
groups = {"elite:male": [elite_m[0]["limitKg"], elite_m[1]["limitKg"]],
          "u18:female": [u18_f[0]["limitKg"]]}
status, grouped = call("POST", "/api/admin/tournaments",
                       setup_body(nameEn="Grouped", genders=["male", "female"], categories=["elite", "u18"],
                                  weightClasses=groups, exactWeightClasses=True), token=TOKEN)
check("a tournament set up as groups is accepted", status in (200, 201), grouped)

status, detail = call("GET", "/api/admin/tournaments/%d" % grouped["id"], token=TOKEN)
pairs = sorted({(d["category"], d["gender"]) for d in detail["divisions"]})
check("only the pairings the groups name are run", pairs == [("elite", "male"), ("u18", "female")], pairs)
check("each with only the classes ticked", len(detail["divisions"]) == 3, len(detail["divisions"]))
check("and the setting reads back", detail.get("exactWeightClasses") is True, detail.get("exactWeightClasses"))

status, empty = call("POST", "/api/admin/tournaments",
                     setup_body(nameEn="Nothing ticked", weightClasses={}, exactWeightClasses=True), token=TOKEN)
check("groups with no class ticked are refused", status == 400, status)


# =========================================================================
say("")
say("=== REQ-01: editing before and after publication are separate grants ===")


def account_with(permissions):
    """A console account holding only the given permissions, and its token."""
    tag = uuid.uuid4().hex[:8]
    st, role = call("POST", "/api/admin/roles",
                    {"key": "t_" + tag, "nameAr": "دور " + tag, "nameEn": "Role " + tag,
                     "permissions": permissions}, token=TOKEN)
    assert st in (200, 201), role
    st, user = call("POST", "/api/admin/users",
                    {"username": "u" + tag, "displayName": "User " + tag, "password": "Tourn@ment2026x",
                     "isActive": True, "roleIds": [role["id"]]}, token=TOKEN)
    assert st in (200, 201), user
    st, login = call("POST", "/api/auth/login", {"username": "u" + tag, "password": "Tourn@ment2026x"})
    assert st == 200, login
    return login["token"]


MANAGER = account_with(["tournament.manage"])
APPROVER = account_with(["tournament.approve"])

status, draft = call("POST", "/api/admin/tournaments", setup_body(nameEn="Permission draft"), token=MANAGER)
check("create & edit - a tournament can be created", status in (200, 201), draft)
DRAFT = draft["id"]

status, _ = call("PUT", "/api/admin/tournaments/%d" % DRAFT, setup_body(nameEn="Draft, edited"), token=MANAGER)
check("create & edit - the draft can be edited", status == 200, status)

status, _ = call("PUT", "/api/admin/tournaments/%d" % DRAFT, setup_body(nameEn="Not mine"), token=APPROVER)
check("approve alone does not edit a draft", status == 403, status)

status, _ = call("POST", "/api/admin/tournaments/%d/publish" % DRAFT, token=MANAGER)
check("create & edit cannot publish", status == 403, status)

status, _ = call("POST", "/api/admin/tournaments/%d/status" % DRAFT, {"status": "published"}, token=MANAGER)
check("nor publish by setting the status", status == 403, status)

status, _ = call("POST", "/api/admin/tournaments/%d/publish" % DRAFT, token=APPROVER)
check("approve publishes it", status == 200, status)

status, _ = call("PUT", "/api/admin/tournaments/%d" % DRAFT, setup_body(nameEn="After"), token=MANAGER)
check("once published, create & edit alone cannot edit it", status == 403, status)

status, _ = call("POST", "/api/admin/tournaments/%d/status" % DRAFT, {"status": "draft"}, token=MANAGER)
check("nor move it back to draft to edit it", status == 403, status)

status, _ = call("POST", "/api/admin/tournaments/%d/registration-closes" % DRAFT,
                 {"closesAt": LATER_CLOSE.isoformat() + "T00:00:00"}, token=MANAGER)
check("nor change when its entries close", status == 403, status)

status, _ = call("PUT", "/api/admin/tournaments/%d" % DRAFT, setup_body(nameEn="Published, edited"), token=APPROVER)
check("approve edits it after publication", status == 200, status)
check("and the edit is saved",
      sql("select NameEn from Tournaments where Id=?", (DRAFT,))[0][0] == "Published, edited")

status, catalogue = call("GET", "/api/admin/access/permissions", token=TOKEN)
first = next((g for g in catalogue if g["key"] == "tournaments"), {})
check("the Tournaments section holds just those two permissions",
      [p["key"] for p in first.get("permissions", [])] == ["tournament.manage", "tournament.approve"],
      [p["key"] for p in first.get("permissions", [])])
keys = [g["key"] for g in catalogue]
check("and the other tournament permissions follow it, unchanged",
      "tournament_operation" in keys and keys.index("tournament_operation") == keys.index("tournaments") + 1
      # Stage 5 adds tournament.schedule.cross_ring and tournament.schedule.exceptions (8 -> 10);
      # Stage 5 Step 3 adds tournament.schedule.publish (10 -> 11).
      and len(next(g for g in catalogue if g["key"] == "tournament_operation")["permissions"]) == 11, keys)


# =========================================================================
say("")
say("=== published tournaments are shown in the website's Activities ===")


def feed(**params):
    query = "&".join("%s=%s" % pair for pair in params.items())
    st, items = call("GET", "/api/events" + ("?" + query if query else ""))
    assert st == 200, items
    return items


status, opts = call("GET", "/api/admin/tournaments/options", token=TOKEN)
check("the display locations are the Activities categories",
      [c["value"] for c in opts.get("activityCategories", [])]
      == ["community", "regional", "international", "camp", "workshop"],
      opts.get("activityCategories"))

status, shown = call("POST", "/api/admin/tournaments",
                     setup_body(nameEn="Shown in Activities", descriptionEn="Open to all clubs.",
                                activityCategory="regional"), token=TOKEN)
check("a tournament keeps its display location", status in (200, 201) and shown["activityCategory"] == "regional",
      shown)
PUBLIC_ID = "tournament-%d" % shown["id"]

check("a draft is not in Activities", all(e["id"] != PUBLIC_ID for e in feed()))
status, _ = call("GET", "/api/events/" + PUBLIC_ID)
check("nor reachable by its details link", status == 404, status)

call("POST", "/api/admin/tournaments/%d/publish" % shown["id"], token=TOKEN)
listed = next((e for e in feed() if e["id"] == PUBLIC_ID), None)
check("once published it is under All", listed is not None)
check("under the category chosen for it", any(e["id"] == PUBLIC_ID for e in feed(category="regional")))
check("and not under another", all(e["id"] != PUBLIC_ID for e in feed(category="international")))
check("as an activity: name, description, dates, location, category",
      listed and listed["titleEn"] == "Shown in Activities" and listed["descriptionEn"] == "Open to all clubs."
      and listed["category"] == "regional" and listed["locationEn"] == "Jeddah" and listed["startDate"]
      and listed["endDate"], listed)
check("and nothing internal",
      listed and not {"entries", "divisions", "type", "competitionType", "publishedAt", "lastActionBy"} & set(listed)
      and listed["status"] == "confirmed", sorted(listed or {}))

status, detail = call("GET", "/api/events/%s?lang=ar" % PUBLIC_ID)
check("its details link works, in Arabic too",
      status == 200 and detail["activity"]["title"] == "بطولة الفجوات", detail)
info = detail.get("tournament") or {}
check("the details say it is a tournament, with its own facts",
      info.get("categoryEn") == "Regional Championships" and info.get("registrationOpen") is True
      and info.get("competitionTypeEn") and info.get("typeEn") and info.get("firstBoutTime") == "17:00", info)
check("and list only its own divisions", len(info.get("divisions", [])) == len(
      call("GET", "/api/admin/tournaments/%d" % shown["id"], token=TOKEN)[1]["divisions"]),
      len(info.get("divisions", [])))

call("POST", "/api/admin/tournaments/%d/publish" % grouped["id"], token=TOKEN)
status, mixed = call("GET", "/api/events/tournament-%d" % grouped["id"])
order = [(d["genderEn"], d["categoryEn"]) for d in (mixed.get("tournament") or {}).get("divisions", [])]
check("divisions are listed Female first, then Male",
      order == sorted(order, key=lambda pair: pair[0] != "Female") and order[0][0] == "Female", order)
weights = [float(d["weightEn"].split()[0].lstrip("+")) for d in mixed["tournament"]["divisions"]
           if d["genderEn"] == "Male"]
check("and lightest to heaviest within a category", weights == sorted(weights), weights)

status, event_detail = call("GET", "/api/events")
plain = next((e for e in event_detail if not str(e["id"]).startswith("tournament-")), None)
if plain:
    status, plain_detail = call("GET", "/api/events/%s" % plain["id"])
    check("an ordinary event's details are unchanged", status == 200 and "tournament" not in plain_detail
          and plain_detail["id"] == plain["id"], sorted(plain_detail))

status, _ = call("PUT", "/api/admin/tournaments/%d" % shown["id"],
                 setup_body(nameEn="Shown in Activities", activityCategory="international"), token=TOKEN)
check("moving a published tournament to another category is accepted", status == 200, status)
check("it leaves the old category", all(e["id"] != PUBLIC_ID for e in feed(category="regional")))
check("and appears under the new one", any(e["id"] == PUBLIC_ID for e in feed(category="international")))

status, _ = call("POST", "/api/admin/tournaments",
                 setup_body(nameEn="Nowhere", activityCategory="not_a_category"), token=TOKEN)
check("a display location that is not an Activities category is refused", status == 400, status)

call("POST", "/api/admin/tournaments/%d/status" % shown["id"], {"status": "cancelled"}, token=TOKEN)
check("a cancelled tournament leaves Activities", all(e["id"] != PUBLIC_ID for e in feed()))


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
# The non-pregnancy declaration is its own document, not a clause in the consent.
check("a girl's guardian form carries no pregnancy declaration", status == 200 and "حمل" not in girls, status)
status, declaration = call("GET", "/api/admin/athletes/%d/medical/pregnancy-declaration" % GIRL,
                           token=TOKEN, raw=True)
check("her non-pregnancy declaration is a separate form", status == 200 and "إقرار عدم الحمل" in declaration, status)
status, _ = call("GET", "/api/admin/athletes/%d/medical/pregnancy-declaration" % MINOR, token=TOKEN, raw=True)
check("a boy has no non-pregnancy declaration form", status == 409, status)

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
         {"result": "passed", "note": None, "documentsMissing": False,
          "missingDocumentsReason": "Documents to be brought on the day."}, token=TOKEN)
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
                         {"ringId": RING, "date": START.isoformat(),
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
# Stage 5 (approved 2026-11-19): each ring has its own timing per day, which decides every start time;
# the old division-level start/interval (rule 17) is stored but no longer applied.
check("it starts when the ring says (ring/day timing), not the division's superseded 19:30",
      len(slots) > 0 and str(slots[0][0]).startswith("18:00"), slots[:3])


def minutes(value):
    hours, mins = str(value).split(":")[:2]
    return int(hours) * 60 + int(mins)


if len(slots) > 1:
    check("and steps by the ring's interval (12 min), not the division's superseded 7",
          minutes(slots[1][0]) - minutes(slots[0][0]) == 12,
          "%s then %s" % (slots[0][0], slots[1][0]))


# =========================================================================
say("")
say("=== an invitation nobody receives: the link has to be obtainable ===")


def make_club():
    """An approved club membership, which is what a club account speaks for."""
    tail = "".join(chr(97 + (b % 26)) for b in uuid.uuid4().bytes[:5])
    payload = {
        "firstNameAr": "خالد", "fatherNameAr": "علي", "familyNameAr": "الدوسري",
        "firstNameEn": "Khalid", "fatherNameEn": "Ali", "familyNameEn": "Al" + tail,
        "applicantRole": "owner", "applicantId": "1" + str(uuid.uuid4().int)[:9],
        "nationality": "SA", "applicantPhone": "+966512345678",
        "applicantEmail": "app%s@example.com" % uuid.uuid4().hex[:8],
        "officialEmail": "club%s@example.com" % uuid.uuid4().hex[:8],
        "region": "الرياض", "city": "الرياض",
        "nameAr": "نادي الفجوات", "nameEn": "Gap Club " + tail,
        "entityType": "club", "ownerName": "Khalid", "headCoachName": "Coach",
        "headCoachPhone": "+966512345679",
        "googleMapsUrl": "https://maps.google.com/?q=riyadh", "consent": True,
    }
    st, created = call("POST", "/api/registrations", {"type": "club", "payload": payload})
    assert st == 200, created
    rid = sql("select Id from Registrations where ReferenceNumber=?", (created["referenceNumber"],))[0][0]
    for step in ("under_review", "awaiting_approval"):
        call("PUT", "/api/admin/registrations/%d/status" % rid, {"status": step}, token=TOKEN)
    call("PUT", "/api/admin/registrations/%d/status" % rid,
         {"status": "approved", "membershipNumber": "SMF-C-%d" % rid}, token=TOKEN)
    return rid, payload["officialEmail"]


club_id, club_email = make_club()

status, invited = call("POST", "/api/admin/member-accounts/invite",
                       {"email": club_email, "kind": "club", "registrationId": club_id,
                        "displayName": "Gap Club"}, token=TOKEN)
check("a club is invited", status == 200, invited)
check("with no mail server the invitation is not reported as delivered",
      invited["delivered"] is False, invited["delivered"])
check("so the link comes back to be handed over",
      bool(invited.get("activationLink")) and "/account/activate?token=" in invited["activationLink"],
      invited.get("activationLink"))

ACCOUNT = invited["id"]
first_link = invited["activationLink"]

status, checked = call("GET", "/api/member/activate/%s" % first_link.split("token=")[1])
check("that link is a working invitation", checked["valid"] is True, checked)

# A holder who says nothing arrived gets a new one, and the old one dies.
status, fresh = call("POST", "/api/admin/member-accounts/%d/invite-link" % ACCOUNT, token=TOKEN)
check("a fresh link can be issued", status == 200, fresh)
second_link = fresh.get("activationLink") or ""
check("it is a different link", second_link and second_link != first_link, second_link[-12:])

status, stale = call("GET", "/api/member/activate/%s" % first_link.split("token=")[1])
check("issuing a new one retires the old", stale["valid"] is False, stale)

status, good = call("GET", "/api/member/activate/%s" % second_link.split("token=")[1])
check("and the new one works", good["valid"] is True, good)

check("handing over a link is on the record",
      len(sql("select 1 from AuditLog where Action='member_account.invited' and Details like ?",
              ("%shown to an administrator%",))) >= 1)
check("and so is the invitation that created the account",
      len(sql("select 1 from AuditLog where Action='member_account.invited' and EntityRef=?",
              (club_email,))) >= 2,
      sql("select count(*) from AuditLog where EntityRef=?", (club_email,))[0][0])

status, activated = call("POST", "/api/member/activate",
                         {"token": second_link.split("token=")[1], "password": "GapClub2026"})
check("the account activates from the link alone", status == 200 and activated.get("token"), status)

status, spent = call("POST", "/api/admin/member-accounts/%d/invite-link" % ACCOUNT, token=TOKEN)
check("an account already activated has no link to give", status == 409, status)

status, anon = call("POST", "/api/admin/member-accounts/%d/invite-link" % ACCOUNT)
check("and the link is not there for the asking", status in (401, 403), status)

# =========================================================================
say("")
say("=== REQ-05 and REQ-06 rule 3: an athlete's row is not public ===")

status, _ = call("GET", "/api/member/athletes/%d" % ATHLETE)
check("opening an athlete needs a member token", status in (401, 403), status)

status, _ = call("GET", "/api/member/athletes/%d" % ATHLETE, token=TOKEN)
check("and the console's token is not one of those", status in (401, 403), status)

# =========================================================================
say("")
say("=== approved public members sign in (temporary development password) ===")


def register(kind, email, approve=True, reject=False):
    """A public registration made with this address, taken as far as asked."""
    payload = {
        "firstNameAr": "سالم", "fatherNameAr": "محمد", "familyNameAr": "العتيبي",
        "firstNameEn": "Salem", "fatherNameEn": "Mohammed",
        "familyNameEn": "Al" + "".join(chr(97 + (b % 26)) for b in uuid.uuid4().bytes[:5]),
        "documentType": "national_id", "nationalId": "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": "%d-03-10" % (YEAR - 30), "nationality": "SA", "gender": "male",
        "phone": "+966512345678", "email": email, "region": "الرياض", "city": "الرياض",
        "consent": True,
    }
    if kind == "athlete":
        payload.update({"paraAthlete": "no", "currentWeight": "70", "clubName": "Login Club"})
    if kind == "official":
        payload.update({"refereeGrade": "third", "refereeStartDate": "%d-01-01" % (YEAR - 5),
                        "yearsExperience": 5, "tournamentsCount": 0})
    st, created = call("POST", "/api/registrations", {"type": kind, "payload": payload})
    assert st == 200, created
    rid = sql("select Id from Registrations where ReferenceNumber=?", (created["referenceNumber"],))[0][0]
    if reject:
        call("PUT", "/api/admin/registrations/%d/status" % rid, {"status": "under_review"}, token=TOKEN)
        call("PUT", "/api/admin/registrations/%d/status" % rid,
             {"status": "rejected", "statusReason": "Test rejection"}, token=TOKEN)
    elif approve:
        for step in ("under_review", "awaiting_approval"):
            call("PUT", "/api/admin/registrations/%d/status" % rid, {"status": step}, token=TOKEN)
        call("PUT", "/api/admin/registrations/%d/status" % rid,
             {"status": "approved", "membershipNumber": "SMF-L-%d" % rid}, token=TOKEN)
    return rid


def sign_in(email, password):
    return call("POST", "/api/member/login", {"email": email, "password": password})


approved_email = "Login.%s@Example.com" % uuid.uuid4().hex[:8]
APPROVED_RID = register("athlete", approved_email)
check("the registration is approved",
      sql("select Status from Registrations where Id=?", (APPROVED_RID,))[0][0] == "approved")

status, session = sign_in(approved_email.lower(), "123")
check("an approved athlete signs in with their registration email and the temporary password",
      status == 200 and session.get("token") and session.get("kind") == "athlete", session)
status, me = call("GET", "/api/member/me", token=(session or {}).get("token"))
check("and the session is recognised", status == 200, status)

status, again = sign_in(approved_email.upper(), "123")
check("the email is matched whatever its case", status == 200, status)
check("signing in twice does not make a second account",
      sql("select count(*) from MemberAccounts where Email=?", (approved_email.lower(),))[0][0] == 1)
check("the account is the existing kind, attached to that registration",
      sql("select Kind, RegistrationId from MemberAccounts where Email=?", (approved_email.lower(),))[0]
      == ("athlete", APPROVED_RID))

status, _ = sign_in(approved_email, "wrong")
check("a wrong password is refused", status in (400, 401, 409), status)

pending_email = "pending.%s@example.com" % uuid.uuid4().hex[:8]
register("athlete", pending_email, approve=False)
status, _ = sign_in(pending_email, "123")
check("a registration still under review cannot sign in", status in (400, 401, 409), status)

rejected_email = "rejected.%s@example.com" % uuid.uuid4().hex[:8]
REJECTED_RID = register("athlete", rejected_email, reject=True)
check("the rejected registration is rejected",
      sql("select Status from Registrations where Id=?", (REJECTED_RID,))[0][0] == "rejected")
status, _ = sign_in(rejected_email, "123")
check("a rejected registration cannot sign in", status in (400, 401, 409), status)

status, _ = sign_in("nobody.%s@example.com" % uuid.uuid4().hex[:8], "123")
check("an address with no registration cannot sign in", status in (400, 401, 409), status)

official_email = "referee.%s@example.com" % uuid.uuid4().hex[:8]
OFFICIAL_RID = register("official", official_email)
status, ref = sign_in(official_email, "123")
check("an approved referee / official signs in too",
      status == 200 and ref.get("kind") == "official", ref)
status, ref_me = call("GET", "/api/member/me", token=(ref or {}).get("token"))
check("and their account opens", status == 200 and ref_me.get("kind") == "official", status)

sql("update Registrations set Status='suspended' where Id=?", (APPROVED_RID,))
status, _ = sign_in(approved_email, "123")
check("once the membership is no longer approved, sign-in stops", status in (400, 401, 409), status)

status, _ = call("POST", "/api/auth/login", {"username": "admin", "password": "123"})
check("the temporary password does nothing for the console", status in (400, 401), status)


say("")
say("=" * 60)
say("FAILED: " + (", ".join(failures) if failures else "none"))
# A copy of the run, if somewhere to put it was named.
LOG_PATH = os.environ.get("SMF_TEST_LOG")
if LOG_PATH:
    open(LOG_PATH, "w", encoding="utf-8").write("\n".join(log) + "\n")
sys.exit(1 if failures else 0)
