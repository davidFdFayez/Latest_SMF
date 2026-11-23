"""
REG-11 — the athlete's current (body) weight on the membership record.

A plausibility check by age band, the same on every path that stores it:
public registration, the athlete's own profile change (proposed and when it
is approved), and the administrator's edit. Aged 13 or under: 12–80 kg (it was
20–80, which a U8 athlete in the 16 kg class could not enter truthfully);
14–17: 28–110; 18+: 40–150. It is not a weigh-in and never has to make a class.

Runs against a throwaway database (tests/run-api-tests.sh).
"""
import datetime, json, os, sqlite3, sys, urllib.error, urllib.request, uuid

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = os.environ.get("SMF_TEST_API", "http://127.0.0.1:5197")
DB = os.environ["SMF_TEST_DB"]
TODAY = datetime.date.today()
failures = []


def check(name, ok, detail=""):
    text = str(detail)
    print(("  PASS " if ok else "  FAIL ") + name + (" - " + text[:170] if detail != "" else ""), flush=True)
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
    connection = sqlite3.connect(DB)
    try:
        rows = connection.execute(query, args).fetchall()
        connection.commit()
        return rows
    finally:
        connection.close()


ADMIN = call("POST", "/api/auth/login", {"username": "admin", "password": "Admin@123"})[1]["token"]


def payload(age, weight, gender="female"):
    """A complete athlete registration whose competition age this year is `age`."""
    p = {
        "firstNameAr": "تجربة", "fatherNameAr": "وزن", "familyNameAr": "اختبار",
        "firstNameEn": "Weight", "fatherNameEn": "Check", "familyNameEn": "Test",
        "documentType": "passport", "nationalId": "TW" + uuid.uuid4().hex[:8].upper(),
        "dateOfBirth": "%d-05-10" % (TODAY.year - age), "nationality": "SA", "gender": gender,
        "phone": "+447700900199", "email": "weight.%s@example.test" % uuid.uuid4().hex[:10],
        "region": "منطقة الرياض", "city": "Riyadh", "paraAthlete": "no", "currentWeight": weight,
        "height": "120", "clubName": "Test Club", "consent": True,
    }
    if age < 19:
        p.update({"guardianName": "Test Guardian", "guardianPhone": "+447700900198", "guardianRelation": "mother"})
    return p


def register(age, weight, gender="female"):
    return call("POST", "/api/registrations", {"type": "athlete", "payload": payload(age, weight, gender)})


def approve(rid):
    for step in ("under_review", "awaiting_approval", "approved"):
        st, body = call("PUT", "/api/admin/registrations/%d/status" % rid, {"status": step}, token=ADMIN)
        assert st == 200, body


print("\n=== registration: a U8 athlete (competition age 7) ===")
for w in ("14", "14.00", "15.4", "15.40", "15.75", "16", "16.00", "12", "20", "80"):
    st, body = register(7, w)
    check("current weight %s kg is accepted" % w, st == 200, (st, body))
for w in ("11.99", "0", "-5", "abc", "", "80.01", "1000"):
    st, body = register(7, w)
    errors = body.get("errors", {}) if isinstance(body, dict) else {}
    check("current weight %r is refused, against that field" % w,
          st == 400 and "currentWeight" in errors, (st, errors.get("currentWeight")))
st, body = register(7, "5")
check("the message names the band's range",
      st == 400 and body["errors"]["currentWeight"]["en"] == "Please enter a value between 12 and 80.", body)
st, body = register(7, 15.75)
check("a JSON number (15.75) is accepted too", st == 200, (st, body))

print("\n=== the other age bands are unchanged ===")
for age, bad, good, what in [(15, "27.99", "28", "U16 (competition age 15): 28–110"),
                             (25, "39.99", "40", "adult: 40–150")]:
    st_bad, _ = register(age, bad)
    st_good, _ = register(age, good)
    check("%s — %s refused, %s accepted" % (what, bad, good), st_bad == 400 and st_good == 200, (st_bad, st_good))
st, _ = register(12, "12")
check("aged 12 (U14): 12 kg accepted (the same youth band)", st == 200)
st, _ = register(14, "12")
check("aged 14: 12 kg still refused (28 kg band)", st == 400)

print("\n=== the athlete's own profile change ===")
st, made = register(7, "20")
RID = made["id"]
approve(RID)
EMAIL = json.loads(sql("select PayloadJson from Registrations where Id=?", (RID,))[0][0])["email"]
st, login = call("POST", "/api/member/login", {"email": EMAIL, "password": "123"})
assert st == 200, login
TOKEN = login["token"]
check("an existing 20 kg membership is unchanged and signs in", st == 200)
for w in ("abc", "-1", "0", "11.99", "80.01", ""):
    st, body = call("POST", "/api/member/me/changes", {"changes": {"currentWeight": w}}, token=TOKEN)
    check("proposing %r is refused" % w, st == 400 and "Current weight" in (body or {}).get("messageEn", ""), (st, body))
check("nothing was queued for those", sql("select count(*) from MemberProfileChanges where RegistrationId=?", (RID,))[0][0] == 0)
st, body = call("POST", "/api/member/me/changes", {"changes": {"currentWeight": "15.75"}}, token=TOKEN)
check("proposing 15.75 kg is accepted for review", st == 200, (st, body))
CHANGE = sql("select Id from MemberProfileChanges where RegistrationId=? order by Id desc", (RID,))[0][0]
check("the official record still says 20 until it is approved",
      json.loads(sql("select PayloadJson from Registrations where Id=?", (RID,))[0][0])["currentWeight"] == "20")
st, body = call("POST", "/api/admin/member-accounts/changes/%d/review" % CHANGE, {"approve": True, "note": None}, token=ADMIN)
check("approving it is accepted", st == 200, (st, body))
check("and the record now says 15.75",
      json.loads(sql("select PayloadJson from Registrations where Id=?", (RID,))[0][0])["currentWeight"] == "15.75")
st, body = call("POST", "/api/member/me/changes", {"changes": {"currentWeight": "14", "city": "Jeddah"}}, token=TOKEN)
check("a change of 14 kg alongside another field is accepted", st == 200, (st, body))

# Throwaway database only: a request stored before the rule existed, with a weight it refuses.
sql("insert into MemberProfileChanges (MemberAccountId, RegistrationId, ChangesJson, Status, CreatedAt) "
    "select MemberAccountId, RegistrationId, ?, 'pending', CURRENT_TIMESTAMP from MemberProfileChanges where Id=?",
    (json.dumps({"currentWeight": "-3"}), CHANGE))
OLD = sql("select max(Id) from MemberProfileChanges")[0][0]
st, body = call("POST", "/api/admin/member-accounts/changes/%d/review" % OLD, {"approve": True, "note": None}, token=ADMIN)
check("an older pending request with -3 kg cannot be approved", st == 400, (st, body))
check("so the record keeps its weight",
      json.loads(sql("select PayloadJson from Registrations where Id=?", (RID,))[0][0])["currentWeight"] == "15.75")
st, body = call("POST", "/api/admin/member-accounts/changes/%d/review" % OLD, {"approve": False, "note": "Invalid weight."}, token=ADMIN)
check("but it can be rejected", st == 200, (st, body))

print("\n=== the administrator's edit ===")
current = json.loads(sql("select PayloadJson from Registrations where Id=?", (RID,))[0][0])
for w, want in (("15.4", 200), ("12", 200), ("20", 200), ("11.5", 400), ("abc", 400), ("-2", 400)):
    edited = dict(current, currentWeight=w)
    st, body = call("PUT", "/api/admin/registrations/%d" % RID, {"payload": edited}, token=ADMIN)
    check("admin edit to %s kg: %d" % (w, want), st == want, (st, body))

print("\n=== an existing membership at 20 kg keeps working ===")
st, made = register(7, "20")
OLD_RID = made["id"]
approve(OLD_RID)
old = json.loads(sql("select PayloadJson from Registrations where Id=?", (OLD_RID,))[0][0])
st, body = call("PUT", "/api/admin/registrations/%d" % OLD_RID, {"payload": old}, token=ADMIN)
check("re-saving its record unchanged is accepted", st == 200, (st, body))
check("its status is approved", sql("select Status from Registrations where Id=?", (OLD_RID,))[0][0] == "approved")

print()
print("%d failure(s)" % len(failures))
for name in failures:
    print("  - " + name)
sys.exit(1 if failures else 0)
