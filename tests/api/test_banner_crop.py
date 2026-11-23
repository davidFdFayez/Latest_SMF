"""
Tournament banner: position and zoom (Adjust Image).

Against a throwaway database: a banner starts with no position (the default
framing), the setup form's Save stores one, the admin detail and the public
API return it, values are clamped and rounded, an unchanged position writes
nothing, a position chosen on a replaced image is ignored, a new or removed
image clears it, the upload can carry one (the create flow), the file itself
is stored byte for byte, bad values are refused, a corrupt stored value reads
as no position, and the permissions are the tournament edit permissions.
"""
import os, urllib.request, urllib.error, json, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
# The shared helpers (call, sql, ADMIN, tournament, account_with, base, check, say, failures, START, TODAY, latin).
_source = open(os.path.join(HERE, "test_readiness.py"), encoding="utf-8").read()
exec(_source[:_source.index('say("")\nsay("=== setup ===")')])

PNG_BYTES = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                          "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082")


def upload(tournament_id, data=PNG_BYTES, name="banner.png", ctype="image/png", crop=None, token=None):
    boundary = "----smf" + uuid.uuid4().hex
    parts = [("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\n"
              "Content-Type: %s\r\n\r\n" % (boundary, name, ctype)).encode() + data + b"\r\n"]
    if crop is not None:
        parts.append(("--%s\r\nContent-Disposition: form-data; name=\"crop\"\r\n\r\n%s\r\n" % (boundary, crop)).encode())
    body = b"".join(parts) + ("--%s--\r\n" % boundary).encode()
    head = {"Content-Type": "multipart/form-data; boundary=" + boundary, "Authorization": "Bearer " + (token or ADMIN)}
    request = urllib.request.Request(API + base("/%d/banner" % tournament_id), data=body, method="POST", headers=head)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


def setup_body(name, **extra):
    body = {
        "nameAr": "بطولة البانر", "nameEn": name,
        "type": "local", "competitionType": "muaythai_combat",
        "locationAr": "الرياض", "locationEn": "Riyadh",
        "startDate": START.isoformat(), "endDate": (START + datetime.timedelta(days=1)).isoformat(),
        "registrationClosesAt": (TODAY + datetime.timedelta(days=30)).isoformat() + "T00:00:00",
        "firstBoutTime": "17:00:00", "genders": ["male"], "categories": ["elite"],
        "activityCategory": "regional", "exactWeightClasses": True, "weightClasses": {"elite:male": [60]},
    }
    body.update(extra)
    return body


def detail(tournament_id):
    return call("GET", base("/%d" % tournament_id), token=ADMIN)[1]["tournament"]


def public(tournament_id, lang="en"):
    return call("GET", "/api/events/tournament-%d?lang=%s" % (tournament_id, lang))[1]["activity"]


def stored(tournament_id):
    return sql("select BannerImageUrl, BannerImageCrop from Tournaments where Id=?", (tournament_id,))[0]


def positions_audited(tournament_id):
    return [r[0] for r in sql("select Details from AuditLog where EntityType='tournament' and EntityId=? "
                              "and Details like 'Banner position changed%' order by Id", (tournament_id,))]


def save(tournament_id, name, crop=None, token=None, **extra):
    body = setup_body(name, **extra)
    if crop is not None:
        body["bannerImageCrop"] = crop
    return call("PUT", base("/%d" % tournament_id), body, token=token or ADMIN)


say("")
say("=== setup ===")
NAME = "Banner Cup " + latin()
status, made = call("POST", "/api/admin/tournaments", setup_body(NAME), token=ADMIN)
check("a tournament is created", status in (200, 201), made)
T = made["id"]
check("it is published", call("POST", base("/%d/publish" % T), token=ADMIN)[0] == 200)
OTHER_NAME = "Banner Other " + latin()
status, made = call("POST", "/api/admin/tournaments", setup_body(OTHER_NAME), token=ADMIN)
OTHER = made["id"]
check("the second one is published too", call("POST", base("/%d/publish" % OTHER), token=ADMIN)[0] == 200)

say("")
say("=== a banner starts with no position ===")
check("no banner, no position", detail(T)["bannerImageCrop"] is None)
status, body = upload(T)
check("a banner is uploaded", status == 200 and str(body.get("bannerImageUrl", "")).startswith("/api/media/"), body)
URL = body["bannerImageUrl"]
check("the upload answers with no position", "bannerImageCrop" in body and body["bannerImageCrop"] is None, body)
check("the admin detail has the image and no position", detail(T)["bannerImageUrl"] == URL and detail(T)["bannerImageCrop"] is None)
check("the public API has the image and no position (the page's default framing)",
      public(T)["imageUrl"] == URL and public(T)["imageCrop"] is None, public(T))
with urllib.request.urlopen(urllib.request.Request(API + URL)) as media:
    check("the stored file is the uploaded file, byte for byte", media.read() == PNG_BYTES)

say("")
say("=== Save stores the position ===")
status, body = save(T, NAME, {"x": 20, "y": 70, "zoom": 1.5, "imageUrl": URL})
check("Save with a position succeeds", status == 200, body)
check("the save's answer has it", body.get("bannerImageCrop") == {"x": 20, "y": 70, "zoom": 1.5}, body.get("bannerImageCrop"))
check("the admin detail returns it", detail(T)["bannerImageCrop"] == {"x": 20, "y": 70, "zoom": 1.5}, detail(T)["bannerImageCrop"])
check("it is kept as readable text", stored(T)[1] == "20 70 1.5", stored(T))
for lang in ("en", "ar", "all"):
    check("the public API (%s) returns it with the image" % lang,
          public(T, lang)["imageCrop"] == {"x": 20, "y": 70, "zoom": 1.5} and public(T, lang)["imageUrl"] == URL,
          public(T, lang).get("imageCrop"))
listing = call("GET", "/api/events?lang=en")[1]
items = listing if isinstance(listing, list) else listing.get("items", listing.get("events", []))
mine = [e for e in items if e.get("id") == "tournament-%d" % T]
check("the activities listing returns it too", mine and mine[0].get("imageCrop") == {"x": 20, "y": 70, "zoom": 1.5},
      mine[0].get("imageCrop") if mine else "not listed")
check("the image itself is unchanged by positioning", detail(T)["bannerImageUrl"] == URL)
check("the change is audited once", positions_audited(T) == ["Banner position changed: 20 70 1.5"], positions_audited(T))

status, _ = save(T, NAME, {"x": 20, "y": 70, "zoom": 1.5, "imageUrl": URL})
check("saving the same position again writes no second audit entry", status == 200 and len(positions_audited(T)) == 1,
      positions_audited(T))
status, _ = save(T, NAME, descriptionEn="Edited without the position")
check("a Save that does not send a position leaves it as it is",
      status == 200 and detail(T)["bannerImageCrop"] == {"x": 20, "y": 70, "zoom": 1.5}, detail(T)["bannerImageCrop"])

say("")
say("=== values are kept within range ===")
save(T, NAME, {"x": -5, "y": 140, "zoom": 9, "imageUrl": URL})
check("x and y outside 0–100 and a zoom above 4 are clamped", detail(T)["bannerImageCrop"] == {"x": 0, "y": 100, "zoom": 4},
      detail(T)["bannerImageCrop"])
save(T, NAME, {"x": 50, "y": 50, "zoom": 0.25, "imageUrl": URL})
check("a zoom below 1 becomes 1 — the image always covers the frame", detail(T)["bannerImageCrop"]["zoom"] == 1)
save(T, NAME, {"x": 12.345, "y": 67.891, "zoom": 1.23456, "imageUrl": URL})
check("x and y are kept to a tenth, the zoom to a hundredth",
      detail(T)["bannerImageCrop"] == {"x": 12.3, "y": 67.9, "zoom": 1.23}, detail(T)["bannerImageCrop"])
save(T, NAME, {"zoom": 2, "imageUrl": URL})
check("a missing x or y is the centre", detail(T)["bannerImageCrop"] == {"x": 50, "y": 50, "zoom": 2}, detail(T)["bannerImageCrop"])
status, _ = save(T, NAME, {"x": "left", "y": 50, "zoom": 1, "imageUrl": URL})
check("text where a number belongs is refused", status == 400, status)
check("and the position is left as it was", detail(T)["bannerImageCrop"] == {"x": 50, "y": 50, "zoom": 2})

say("")
say("=== a position belongs to the image it was chosen on ===")
status, body = save(T, NAME, {"x": 5, "y": 5, "zoom": 3, "imageUrl": "/api/media/some-other-image.png"})
check("a position chosen on another image does not fail the save", status == 200, body)
check("but it is not applied", detail(T)["bannerImageCrop"] == {"x": 50, "y": 50, "zoom": 2}, detail(T)["bannerImageCrop"])
status, body = upload(T, name="replacement.png")
check("replacing the image succeeds", status == 200 and body["bannerImageUrl"] != URL, body)
NEW_URL = body["bannerImageUrl"]
check("a new image starts with no position", body["bannerImageCrop"] is None and detail(T)["bannerImageCrop"] is None)
check("and the public page frames it by default", public(T)["imageCrop"] is None and public(T)["imageUrl"] == NEW_URL)
status, _ = save(T, NAME, {"x": 80, "y": 20, "zoom": 1.1, "imageUrl": URL})
check("a Save still holding the old image's position does not apply it to the new one",
      status == 200 and detail(T)["bannerImageCrop"] is None, detail(T)["bannerImageCrop"])
save(T, NAME, {"x": 80, "y": 20, "zoom": 1.1, "imageUrl": NEW_URL})
check("the new image takes its own position", detail(T)["bannerImageCrop"] == {"x": 80, "y": 20, "zoom": 1.1})

say("")
say("=== an upload can carry its position (a tournament being created) ===")
status, body = upload(T, name="with-position.png", crop="30 40 2")
check("an upload with a position succeeds", status == 200, body)
check("the new image has that position at once", body["bannerImageCrop"] == {"x": 30, "y": 40, "zoom": 2}
      and detail(T)["bannerImageCrop"] == {"x": 30, "y": 40, "zoom": 2}, body)
check("its audit entry names the position", sql("select Details from AuditLog where EntityId=? and Details like 'Banner image replaced%' "
                                                 "order by Id desc limit 1", (T,))[0][0].endswith("(position 30 40 2)"))
WITH_URL = body["bannerImageUrl"]
for bad in ("abc", "50 50", "1 2 3 4", "50 50 url(x)"):
    status, _ = upload(T, name="bad.png", crop=bad)
    check("an upload with the position %r is refused" % bad, status == 400, status)
check("refused uploads leave the image and its position as they were",
      detail(T)["bannerImageUrl"] == WITH_URL and detail(T)["bannerImageCrop"] == {"x": 30, "y": 40, "zoom": 2})
check("the existing upload checks still apply (a GIF is refused)",
      upload(T, data=b"GIF89a" + b"\0" * 20, name="b.gif", ctype="image/gif", crop="50 50 1")[0] == 400)
check("and the 5 MB limit", upload(T, data=PNG_BYTES + b"\0" * (5 * 1024 * 1024), name="big.png", crop="50 50 1")[0] == 400)

say("")
say("=== removing the banner removes its position ===")
status, body = call("DELETE", base("/%d/banner" % T), token=ADMIN)
check("the banner is removed", status == 200 and body["bannerImageUrl"] is None and body["bannerImageCrop"] is None, body)
check("nothing is left stored", stored(T) == (None, None), stored(T))
status, _ = save(T, NAME, {"x": 10, "y": 10, "zoom": 1, "imageUrl": WITH_URL})
check("a position with no banner is ignored", status == 200 and stored(T)[1] is None, stored(T))
check("the public page has neither", public(T)["imageUrl"] is None and public(T)["imageCrop"] is None)

say("")
say("=== banners from before positioning existed ===")
upload(OTHER)
check("a banner with no stored position reads as none", detail(OTHER)["bannerImageCrop"] is None
      and public(OTHER)["imageCrop"] is None and public(OTHER)["imageUrl"])
sql("update Tournaments set BannerImageCrop=? where Id=?", ("50%; background: url(javascript:x)", OTHER))
check("a corrupt stored value reads as no position, in the admin", detail(OTHER)["bannerImageCrop"] is None)
check("and on the public page", public(OTHER)["imageCrop"] is None)
sql("update Tournaments set BannerImageCrop=? where Id=?", ("120 -4 9", OTHER))
check("an out-of-range stored value is clamped on the way out", public(OTHER)["imageCrop"] == {"x": 100, "y": 0, "zoom": 4},
      public(OTHER)["imageCrop"])
sql("update Tournaments set BannerImageCrop=NULL where Id=?", (OTHER,))

say("")
say("=== creating a tournament ===")
CREATE_NAME = "Banner New " + latin()
status, made = call("POST", "/api/admin/tournaments",
                    setup_body(CREATE_NAME, bannerImageCrop={"x": 10, "y": 10, "zoom": 2}), token=ADMIN)
check("a position sent with the creation (before any image) is ignored", status in (200, 201) and stored(made["id"]) == (None, None))
NEW_T = made["id"]
status, body = upload(NEW_T, crop="25 75 1.75")
check("then the image arrives with the position chosen while creating",
      status == 200 and detail(NEW_T)["bannerImageCrop"] == {"x": 25, "y": 75, "zoom": 1.75}, body)

say("")
say("=== permissions: the tournament edit permissions ===")
DIRECTOR = account_with(["tournament.director"])
TECH = account_with(["tournament.technical"])
MANAGE_ONLY = account_with(["tournament.manage"])
APPROVER = account_with(["tournament.approve"])
status, body = upload(T)
URL = body["bannerImageUrl"]
for label, token in (("the technical team", TECH), ("the director", DIRECTOR)):
    check("%s cannot save a position" % label, save(T, NAME, {"x": 1, "y": 1, "zoom": 1, "imageUrl": URL}, token=token)[0] == 403)
    check("%s cannot upload with one" % label, upload(T, crop="1 1 1", token=token)[0] == 403)
check("manage-only cannot position a published tournament's banner",
      save(T, NAME, {"x": 1, "y": 1, "zoom": 1, "imageUrl": URL}, token=MANAGE_ONLY)[0] == 403)
check("refused saves left it unpositioned", detail(T)["bannerImageCrop"] is None)
status, _ = save(T, NAME, {"x": 60, "y": 40, "zoom": 1.2, "imageUrl": URL}, token=APPROVER)
check("the approval permission can", status == 200 and detail(T)["bannerImageCrop"] == {"x": 60, "y": 40, "zoom": 1.2})
check("manage-only can position a draft's banner",
      upload(NEW_T, crop="5 5 1", token=MANAGE_ONLY)[0] == 200
      and save(NEW_T, CREATE_NAME, {"x": 45, "y": 55, "zoom": 1, "imageUrl": detail(NEW_T)["bannerImageUrl"]},
               token=MANAGE_ONLY)[0] == 200
      and detail(NEW_T)["bannerImageCrop"] == {"x": 45, "y": 55, "zoom": 1})
check("the other tournament was never touched", stored(OTHER)[1] is None and detail(OTHER)["bannerImageUrl"])

say("")
if failures:
    say("FAILED: %d — %s" % (len(failures), "; ".join(failures)))
    sys.exit(1)
say("ALL BANNER POSITION CHECKS PASSED")
