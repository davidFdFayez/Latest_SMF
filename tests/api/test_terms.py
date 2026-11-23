"""
Tournament Terms & Conditions — stored per tournament in both languages,
cleaned before it is kept, kept when an edit does not mention it, and
served on the public tournament page.
"""
import json, sys, os, uuid, urllib.request, urllib.error, datetime, sqlite3

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = os.environ.get("SMF_TEST_API", "http://127.0.0.1:5197")
DB = os.environ["SMF_TEST_DB"]
TODAY = datetime.date.today()
START = TODAY + datetime.timedelta(days=40)
failures = []


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
    connection = sqlite3.connect(DB)
    try:
        return connection.execute(query, args).fetchall()
    finally:
        connection.close()


ADMIN = call("POST", "/api/auth/login", {"username": "admin", "password": "Admin@123"})[1]["token"]


def setup_body(**extra):
    body = {
        "nameAr": "بطولة الشروط", "nameEn": "Terms Cup " + uuid.uuid4().hex[:5],
        "type": "local", "competitionType": "muaythai_combat",
        "locationAr": "الرياض", "locationEn": "Riyadh",
        "startDate": START.isoformat(), "endDate": (START + datetime.timedelta(days=1)).isoformat(),
        "registrationClosesAt": (TODAY + datetime.timedelta(days=30)).isoformat() + "T00:00:00",
        "firstBoutTime": "17:00:00", "genders": ["male"], "categories": ["elite"],
        "activityCategory": "regional", "exactWeightClasses": True, "weightClasses": {"elite:male": [60]},
    }
    body.update(extra)
    return body


def admin_view(tid):
    return call("GET", "/api/admin/tournaments/%d" % tid, token=ADMIN)[1]["tournament"]


def public_view(tid, lang="ar"):
    return call("GET", "/api/events/tournament-%d?lang=%s" % (tid, lang))


AR = ("<h2>الشروط العامة</h2><p>يلتزم <strong>اللاعب</strong> <em>بالأنظمة</em> <u>المعتمدة</u>.</p>"
      "<ol><li><p>إحضار الهوية</p></li><li><p>الفحص الطبي</p></li></ol>"
      "<ul><li><p>بند نقطي</p></li></ul><p style=\"text-align: center\">سطر<br>ثانٍ</p>")
EN = "<h3>General</h3><p>Athletes must <strong>comply</strong>.</p><ul><li><p>Bring ID</p></li></ul>"

say("=== create ===")
status, made = call("POST", "/api/admin/tournaments", setup_body(termsAr=AR, termsEn=EN), token=ADMIN)
check("a tournament is created with Terms & Conditions", status in (200, 201), made)
T = made["id"]
t = admin_view(T)
check("the Arabic terms come back exactly as the editor wrote them", t["termsAr"] == AR, t["termsAr"])
check("the English terms too", t["termsEn"] == EN, t["termsEn"])

status, plain = call("POST", "/api/admin/tournaments", setup_body(), token=ADMIN)
check("a tournament can be created without any", status in (200, 201), plain)
p = admin_view(plain["id"])
check("and has none", p["termsAr"] == "" and p["termsEn"] == "", (p["termsAr"], p["termsEn"]))

say("")
say("=== editing ===")
call("PUT", "/api/admin/tournaments/%d" % T, setup_body(nameEn="Terms Cup renamed"), token=ADMIN)
t = admin_view(T)
check("an edit that does not mention them keeps both", t["termsAr"] == AR and t["termsEn"] == EN)
check("while the edit itself is saved", t["nameEn"] == "Terms Cup renamed", t["nameEn"])

call("PUT", "/api/admin/tournaments/%d" % T,
     setup_body(nameEn="Terms Cup renamed", locationEn="Jeddah", termsAr=AR, termsEn=EN), token=ADMIN)
t = admin_view(T)
check("saving the whole form with other fields changed keeps them too", t["termsAr"] == AR and t["termsEn"] == EN and t["locationEn"] == "Jeddah")

new_ar = "<p>نص <strong>معدّل</strong></p>"
call("PUT", "/api/admin/tournaments/%d" % T, setup_body(nameEn="Terms Cup renamed", termsAr=new_ar), token=ADMIN)
t = admin_view(T)
check("the Arabic terms can be changed on their own", t["termsAr"] == new_ar and t["termsEn"] == EN, (t["termsAr"], t["termsEn"]))

call("PUT", "/api/admin/tournaments/%d" % T, setup_body(nameEn="Terms Cup renamed", termsEn="<p></p>"), token=ADMIN)
t = admin_view(T)
check("an empty editor clears that language only", t["termsEn"] == "" and t["termsAr"] == new_ar, (t["termsAr"], t["termsEn"]))

updates = sql("select count(*) from AuditLog where EntityType='tournament' and EntityId=? and Action='tournament.updated'", (T,))[0][0]
check("each edit is audited as a tournament update", updates >= 4, updates)

say("")
say("=== cleaning ===")
attack = ("<p onclick=\"alert(1)\">a</p><script>alert(1)</script><img src=x onerror=alert(1)>"
          "<a href=\"javascript:alert(1)\">link</a><iframe src=\"https://evil\"></iframe>"
          "<p style=\"text-align: right; background:url(javascript:x)\">b</p><svg onload=alert(1)></svg>")
call("PUT", "/api/admin/tournaments/%d" % T, setup_body(nameEn="Terms Cup renamed", termsEn=attack), token=ADMIN)
t = admin_view(T)
stored = sql("select TermsEn from Tournaments where Id=?", (T,))[0][0]
check("what is stored has no script, handler, image, link, frame or svg",
      not any(bad in stored.lower() for bad in ["<script", "onclick", "onerror", "<img", "<a ", "javascript:", "<iframe", "<svg", "onload"]), stored)
check("and keeps the safe parts", stored == "<p>a</p>link<p style=\"text-align: right\">b</p>", stored)

status, body = call("PUT", "/api/admin/tournaments/%d" % T,
                    setup_body(nameEn="Terms Cup renamed", termsEn="<p>" + "x" * 100_001 + "</p>"), token=ADMIN)
check("text past the limit is refused", status == 400, (status, body if status != 200 else ""))
check("and nothing changes", admin_view(T)["termsEn"] == stored)

say("")
say("=== public page ===")
check("a draft's terms are not public", public_view(T)[0] == 404)
call("PUT", "/api/admin/tournaments/%d" % T, setup_body(nameEn="Terms Cup renamed", termsAr=AR, termsEn=EN), token=ADMIN)
status, _ = call("POST", "/api/admin/tournaments/%d/publish" % T, token=ADMIN)
check("published", status == 200, status)
status, page = public_view(T, "ar")
check("the public page carries both languages", status == 200 and page["tournament"]["termsAr"] == AR and page["tournament"]["termsEn"] == EN, page and page.get("tournament", {}).get("termsAr"))
status, page = public_view(T, "en")
check("in either page language", status == 200 and page["tournament"]["termsEn"] == EN)
call("POST", "/api/admin/tournaments/%d/publish" % plain["id"], token=ADMIN)
status, page = public_view(plain["id"])
check("a tournament without terms says so with empty text", status == 200 and page["tournament"]["termsAr"] == "" and page["tournament"]["termsEn"] == "")

say("")
say("FAILED: " + (", ".join(failures) if failures else "none"))
sys.exit(1 if failures else 0)
