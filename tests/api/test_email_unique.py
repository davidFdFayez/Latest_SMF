"""
One email address, one registration identity — across athletes, coaches,
clubs and officials. Checked on submission (whatever the type, case or
surrounding spaces), against every registration that still holds its address
(legacy ones included) and every member account; released only by Rejected
and Cancelled; safe under concurrent submissions; and the development sign-in
never guesses between several memberships sharing an address.
"""
import json, sys, os, uuid, urllib.request, urllib.error, datetime, sqlite3, threading

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = os.environ.get("SMF_TEST_API", "http://127.0.0.1:5197")
DB = os.environ["SMF_TEST_DB"]
YEAR = datetime.date.today().year
failures = []
MSG_EN = "This email address is already registered. Please use a different email address."
MSG_AR = "هذا البريد الإلكتروني مسجل مسبقًا. يرجى استخدام بريد إلكتروني آخر."


def say(text):
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
    connection = sqlite3.connect(DB, timeout=30)
    try:
        rows = connection.execute(query, args).fetchall()
        connection.commit()
        return rows
    finally:
        connection.close()


TOKEN = call("POST", "/api/auth/login", {"username": "admin", "password": "Admin@123"})[1]["token"]
latin = lambda: "".join(chr(97 + (b % 26)) for b in uuid.uuid4().bytes[:5])
fresh = lambda tag="u": "%s.%s@example.com" % (tag, uuid.uuid4().hex[:10])


def payload(kind, email, club_applicant=None, national_id=None):
    if kind == "club":
        return {
            "firstNameAr": "خالد", "fatherNameAr": "علي", "familyNameAr": "الدوسري",
            "firstNameEn": "Khalid", "fatherNameEn": "Ali", "familyNameEn": "Al" + latin(),
            "applicantRole": "owner", "applicantId": "1" + str(uuid.uuid4().int)[:9],
            "nationality": "SA", "applicantPhone": "+966512345678",
            "applicantEmail": club_applicant or fresh("applicant"), "officialEmail": email,
            "region": "الرياض", "city": "الرياض",
            "nameAr": "نادي الرياض", "nameEn": "Riyadh Club " + latin(),
            "entityType": "club", "ownerName": "Khalid", "headCoachName": "Coach",
            "headCoachPhone": "+966512345679",
            "googleMapsUrl": "https://maps.google.com/?q=riyadh", "consent": True,
        }
    body = {
        "firstNameAr": "سالم", "fatherNameAr": "محمد", "familyNameAr": "العتيبي",
        "firstNameEn": "Salem", "fatherNameEn": "Mohammed", "familyNameEn": "Al" + latin(),
        "documentType": "national_id", "nationalId": national_id or "1" + str(uuid.uuid4().int)[:9],
        "dateOfBirth": "%d-03-10" % (YEAR - 30), "nationality": "SA", "gender": "male",
        "phone": "+966512345678", "email": email, "region": "الرياض", "city": "الرياض",
        "consent": True,
    }
    if kind == "athlete":
        body.update({"paraAthlete": "no", "currentWeight": "70", "clubName": "Unique Club"})
    if kind == "official":
        body.update({"refereeGrade": "third", "refereeStartDate": "%d-01-01" % (YEAR - 5),
                     "yearsExperience": 5, "tournamentsCount": 0})
    return body


def submit(kind, email, **extra):
    return call("POST", "/api/registrations", {"type": kind, "payload": payload(kind, email, **extra)})


def rid_of(created):
    return sql("select Id from Registrations where ReferenceNumber=?", (created["referenceNumber"],))[0][0]


def move(rid, *statuses):
    for status in statuses:
        body = {"status": status}
        if status == "approved":
            body["membershipNumber"] = "SMF-U-%d" % rid
        if status in ("rejected", "cancelled", "suspended", "awaiting_completion", "expired", "completed"):
            body["statusReason"] = "Email uniqueness test"
        st, res = call("PUT", "/api/admin/registrations/%d/status" % rid, body, token=TOKEN)
        assert st == 200, (status, res)


def refused(result, field="email"):
    status, body = result
    errors = (body or {}).get("errors") or {} if isinstance(body, dict) else {}
    return (status == 400 and field in errors
            and errors[field].get("en") == MSG_EN and errors[field].get("ar") == MSG_AR)


def count_with(email):
    return sum(1 for (p,) in sql("select PayloadJson from Registrations")
               if email.lower() in p.lower())


say("=== every type against every type ===")
TYPES = ["athlete", "coach", "club", "official"]
for first in TYPES:
    for second in TYPES:
        email = fresh(first[:2] + second[:2])
        st, made = submit(first, email)
        assert st == 200, made
        field = "officialEmail" if second == "club" else "email"
        check("%s then %s with the same email is refused" % (first, second), refused(submit(second, email), field))

say("")
say("=== normalization ===")
email = fresh("Case")
assert submit("athlete", email)[0] == 200
check("a different case is refused", refused(submit("coach", email.upper())))
check("surrounding spaces are refused", refused(submit("official", "   %s \t" % email)))
check("both at once are refused", refused(submit("athlete", "  " + email.title() + "  ")))
other = fresh("other")
st, made = submit("athlete", other)
check("a different email registers normally", st == 200, made)
check("and its normalized address is stored",
      sql("select NormalizedEmail from Registrations where Id=?", (rid_of(made),))[0][0] == other, other)
check("the form keeps what was typed", json.loads(sql("select PayloadJson from Registrations where Id=?",
                                                         (rid_of(made),))[0][0])["email"] == other)

say("")
say("=== a club's two addresses ===")
applicant = fresh("applicant")
club_email = fresh("club")
st, made = submit("club", club_email, club_applicant=applicant)
check("a club with its applicant and official emails registers", st == 200, made)
check("the applicant's address is reserved too", refused(submit("coach", applicant)))
check("a club reusing another club's applicant address is refused",
      refused(submit("club", fresh("club2"), club_applicant=applicant), "applicantEmail"))
same = fresh("same")
check("a club may give one address for both", submit("club", same, club_applicant=same)[0] == 200)

say("")
say("=== which statuses hold their address ===")
for label, path in [("new (pending)", []), ("under review", ["under_review"]),
                    ("awaiting completion", ["awaiting_completion"]),
                    ("awaiting approval", ["under_review", "awaiting_approval"]),
                    ("approved", ["under_review", "awaiting_approval", "approved"]),
                    ("completed", ["under_review", "awaiting_approval", "approved", "completed"]),
                    ("suspended", ["under_review", "awaiting_approval", "approved", "suspended"]),
                    ("expired", ["under_review", "awaiting_approval", "approved", "expired"])]:
    email = fresh("st")
    st, made = submit("athlete", email)
    move(rid_of(made), *path)
    check("%s reserves its email" % label, refused(submit("coach", email)))

email = fresh("rej")
person = "1" + str(uuid.uuid4().int)[:9]
st, made = submit("athlete", email, national_id=person)
REJECTED = rid_of(made)
move(REJECTED, "under_review", "rejected")
st, again = submit("athlete", email, national_id=person)
check("rejected releases it: applying again works", st == 200, again)
check("and the new request is linked to the rejected one (reapplication workflow)",
      sql("select SupersedesId from Registrations where Id=?", (rid_of(again),))[0][0] == REJECTED)
check("but only once: the new request holds the address again", refused(submit("athlete", email)))

email = fresh("can")
st, made = submit("coach", email)
move(rid_of(made), "cancelled")
check("cancelled releases it", submit("official", email)[0] == 200)

say("")
say("=== member accounts always hold their address ===")
email = fresh("acct")
st, made = submit("athlete", email)
HELD = rid_of(made)
move(HELD, "under_review", "awaiting_approval", "approved")
st, signed = call("POST", "/api/member/login", {"email": email, "password": "123"})
check("the approved athlete opens an account", st == 200 and signed.get("kind") == "athlete", signed)
move(HELD, "cancelled")
check("with the registration cancelled, the account still holds the address", refused(submit("coach", email)))

say("")
say("=== registrations made before this change (no normalized address) ===")
legacy = fresh("legacy")
sql("insert into Registrations (Type, PayloadJson, ReferenceNumber, Status, CreatedAt, RenewalCount, StageOrder) "
    "values ('coach', ?, ?, 'approved', ?, 0, 0)",
    (json.dumps({"email": legacy.upper() + " "}), "SMF-T-LEGACY-%s" % uuid.uuid4().hex[:6],
     datetime.datetime.utcnow().isoformat(sep=" ")))
check("a legacy registration still holds its address", refused(submit("athlete", legacy)))
legacy_applicant = fresh("legacyapp")
sql("insert into Registrations (Type, PayloadJson, ReferenceNumber, Status, CreatedAt, RenewalCount, StageOrder) "
    "values ('club', ?, ?, 'new', ?, 0, 0)",
    (json.dumps({"applicantEmail": legacy_applicant, "officialEmail": fresh("legacyclub")}),
     "SMF-C-LEGACY-%s" % uuid.uuid4().hex[:6], datetime.datetime.utcnow().isoformat(sep=" ")))
check("a legacy club's applicant address is held too", refused(submit("official", legacy_applicant)))
check("legacy records are left as they were (no normalized address written)",
      sql("select count(*) from Registrations where ReferenceNumber like '%LEGACY%' and NormalizedEmail is not null")[0][0] == 0)

say("")
say("=== concurrent submissions ===")


def burst(email, kinds):
    results = []
    lock = threading.Lock()
    gate = threading.Barrier(len(kinds))

    def one(kind):
        gate.wait()
        r = submit(kind, email)
        with lock:
            results.append(r)

    threads = [threading.Thread(target=one, args=(k,)) for k in kinds]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


email = fresh("race")
results = burst(email, ["athlete"] * 12)
ok = [r for r in results if r[0] == 200]
check("twelve identical submissions at once: exactly one is accepted", len(ok) == 1, [r[0] for r in results])
check("the other eleven get the email error", sum(1 for r in results if refused(r)) == 11, [r[0] for r in results])
check("and only one registration exists with it", count_with(email) == 1, count_with(email))

email = fresh("racemix")
results = burst(email, ["athlete", "coach", "official", "athlete", "coach", "official", "athlete", "coach"])
check("eight mixed-type submissions at once: exactly one is accepted",
      sum(1 for r in results if r[0] == 200) == 1, [r[0] for r in results])
check("and only one registration exists with it", count_with(email) == 1, count_with(email))

email = fresh("raceleg")
sql("insert into Registrations (Type, PayloadJson, ReferenceNumber, Status, CreatedAt, RenewalCount, StageOrder) "
    "values ('athlete', ?, ?, 'approved', ?, 0, 0)",
    (json.dumps({"email": email}), "SMF-A-LEGACY-%s" % uuid.uuid4().hex[:6], datetime.datetime.utcnow().isoformat(sep=" ")))
results = burst(email, ["coach"] * 8)
check("eight at once against a legacy holder: none accepted", all(refused(r) for r in results), [r[0] for r in results])

say("")
say("=== the index is the second line of defence ===")
dup = fresh("index")
assert submit("athlete", dup)[0] == 200
try:
    sql("insert into Registrations (Type, PayloadJson, ReferenceNumber, Status, CreatedAt, RenewalCount, StageOrder, NormalizedEmail) "
        "values ('coach', '{}', ?, 'new', ?, 0, 0, ?)",
        ("SMF-T-IDX-%s" % uuid.uuid4().hex[:6], datetime.datetime.utcnow().isoformat(sep=" "), dup))
    check("the database itself refuses a second holder", False, "inserted")
except sqlite3.IntegrityError as error:
    check("the database itself refuses a second holder", "NormalizedEmail" in str(error), error)
sql("insert into Registrations (Type, PayloadJson, ReferenceNumber, Status, CreatedAt, RenewalCount, StageOrder, NormalizedEmail) "
    "values ('coach', '{}', ?, 'rejected', ?, 0, 0, ?)",
    ("SMF-T-IDX-%s" % uuid.uuid4().hex[:6], datetime.datetime.utcnow().isoformat(sep=" "), dup))
check("but a rejected one alongside is allowed", True)

say("")
say("=== development sign-in never guesses ===")
shared = fresh("shared")
for kind, ref in [("athlete", "A"), ("coach", "T")]:
    sql("insert into Registrations (Type, PayloadJson, ReferenceNumber, Status, CreatedAt, ApprovedAt, RenewalCount, StageOrder) "
        "values (?, ?, ?, 'approved', ?, ?, 0, 0)",
        (kind, json.dumps({"email": shared}), "SMF-%s-SHARED-%s" % (ref, uuid.uuid4().hex[:6]),
         datetime.datetime.utcnow().isoformat(sep=" "), datetime.datetime.utcnow().isoformat(sep=" ")))
st, body = call("POST", "/api/member/login", {"email": shared, "password": "123"})
check("two approved memberships share an address: no account is opened", st != 200, (st, body))
check("and none was created", sql("select count(*) from MemberAccounts where Email=?", (shared,))[0][0] == 0)
check("an existing account is untouched by the rule", sql("select Kind, RegistrationId from MemberAccounts where RegistrationId=?",
                                                         (HELD,))[0] == ("athlete", HELD))

say("")
say("=== an invitation cannot take another membership's address ===")
holder = fresh("holder")
st, made = submit("coach", holder)
move(rid_of(made), "under_review", "awaiting_approval", "approved")
st, ath = submit("athlete", fresh("invitee"))
ATH = rid_of(ath)
move(ATH, "under_review", "awaiting_approval", "approved")
st, body = call("POST", "/api/admin/member-accounts/invite",
                {"email": holder, "kind": "athlete", "registrationId": ATH, "displayName": "X"}, token=TOKEN)
check("inviting an athlete's account with a coach's address is refused", st == 409, (st, body))
own = json.loads(sql("select PayloadJson from Registrations where Id=?", (ATH,))[0][0])["email"]
st, body = call("POST", "/api/admin/member-accounts/invite",
                {"email": own, "kind": "athlete", "registrationId": ATH, "displayName": "X"}, token=TOKEN)
check("its own address is fine", st == 200, (st, body))

say("")
say("FAILED: " + (", ".join(failures) if failures else "none"))
sys.exit(1 if failures else 0)
