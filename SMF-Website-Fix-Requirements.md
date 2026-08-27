# SMF Website — Fix & Requirements Execution Plan

**Source:** Website.xlsx (Sheet 1: Arabic content edits · Sheet 2: QA findings log)
**Project:** Saudi Muaythai Federation public website (React SPA + API, staging at `smf.187-124-4-73.sslip.io`, production target `saudimuaythai.sa` behind Cloudflare)
**Extracted:** 2026-08-09
**Scope:** 27 pending QA/engineering items + 43 content/text corrections. 1 item already Fixed (language toggle).

---

## How to Execute This File in Claude Code

Work through the phases **in order**. Each phase has a paste-ready prompt at the end of this document (Section E). Recommended order:

| Phase | Focus | Items |
|---|---|---|
| P0 | Critical blockers | REG-01 |
| P1 | Registration form overhaul (data standards, validation, eligibility, notifications) | REG-02 → REG-10 |
| P2 | Security & infrastructure hardening | SEC-01 → SEC-06 |
| P3 | Content bugs & template gaps (photos, thumbnails, news template, timeline) | CNT-01 → CNT-06 |
| P4 | Feature gaps & UX polish | FEA-01, UX-01, UX-02, QA-01 |
| P5 | Arabic/English text corrections (site-wide copy pass) | TXT-01 → TXT-43 |

**Definition of Done for every item:** fix implemented → verified against the "Acceptance" line → both Arabic and English variants checked (bilingual site) → no regression in the language toggle (previously Critical, now Fixed — retest after every routing change).

---

## A. Critical Blockers (P0)

### REG-01 — Cannot navigate between registration types 🔴 Critical
- **Bug:** From `/registration/athlete`, selecting Registration > Club / Coach / Official in the menu changes the URL for a split second, then reverts. Users cannot move between the four registration forms at all.
- **Fix:** Repair SPA routing so `/registration/athlete`, `/registration/club`, `/registration/coach`, `/registration/official` are freely navigable at any time (likely a route guard, unsaved-form blocker, or redirect effect firing incorrectly).
- **Acceptance:** All four forms reachable from the top menu from any page, in both languages, without cache clearing.

> ✅ **Already Fixed (retest only):** Language toggle stuck on English (AR↔EN must work bidirectionally site-wide without cache clear). Include in regression suite for every routing/i18n change.

---

## B. Registration Overhaul (P1)

### REG-02 — Adopt canonical data standards (all forms) 🟠 High
Intake must follow existing standards — do **not** invent per-form formats:
- **Phone:** E.164 (`+966XXXXXXXXX`)
- **Nationality:** ISO 3166-1 alpha-2 codes
- **Dates:** ISO 8601 (`YYYY-MM-DD`)
- **Names:** three separate parts (given / father / family), in **both Arabic and English**
- **Acceptance:** Stored records conform to all four standards across athlete, club, coach, official forms.

### REG-03 — Split the name fields 🟠 High
- **Current:** One combined "Full Name (Arabic)" + one "Full Name (English)".
- **Fix:** First Name, Second (Father) Name, Surname — separately for Arabic and English (6 fields).
- **Acceptance:** Six distinct fields present and required on athlete registration; mapped to the new data model.

### REG-04 — Real name validation (athlete + club) 🟠 High
- **Current:** Single-word "Ali" accepted; Latin text accepted in Arabic fields; no script validation.
- **Fix:** Arabic-script-only on Arabic fields; Latin-only on English fields; multi-part name required. Apply the same to Club Arabic/English name fields.
- **Acceptance:** Wrong-script and single-word entries rejected with clear inline errors (AR + EN messages).

### REG-05 — Age & eligibility rules + auto category 🟠 High
- **Enforce:** Athlete age **6–45** · Coach **≥18** · Referee **≥18** · Referee officiating details **required**.
- **Auto-calculate athlete category** (Junior / Youth / Senior / Elite / Para) from age, weight, and gender by default.
- **Acceptance:** Out-of-range DOBs rejected on every form; category auto-populates; officiating details cannot be left blank.

### REG-06 — Confirmation email with reference number 🟠 High
- **Fix:** On successful submission, send an automated email (in-server email acceptable for now) containing a reference number, e.g. `SMF-A-2026-00003`.
- **Baseline copy:** "Hello {Athlete Name}, Thank you for submitting your athlete registration with the Saudi Muaythai Federation (SMF). Your reference number: SMF-A-2026-00003. We will review your application and be in touch shortly. Saudi Muaythai Federation | info@saudimuaythai.sa"
- **Acceptance:** Email received on submit; reference number stored with the application and unique per submission.

### REG-07 — Nationality "Other" option is unusable 🟡 Medium
- **Current:** Fixed Gulf/Arab list + "Other"; selecting "Other" reveals nothing — unlisted nationalities cannot register.
- **Fix (preferred):** Replace with a complete ISO 3166 country list. Alternatively: reveal a free-text input on "Other", assign the correct ISO code, and add to the master list.
- **Acceptance:** An athlete from any country can select their nationality; stored as ISO alpha-2.

### REG-08 — Phone country-code selector (all forms) 🟡 Medium
- **Fix:** Add a country-code selector (default `+966`) on every phone field across all forms; update placeholder/error text (currently `05XXXXXXXX` Saudi-only).
- **Acceptance:** International numbers enterable with clear guidance; stored as E.164.

### REG-09 — Upload size cap + compression 🟡 Medium
- **Fix:** Cap uploads (photo / ID / certificate: `.jpg/.jpeg/.png/.webp/.pdf`) at **~1 MB**, with automatic client- or server-side image compression before storage.
- **Acceptance:** Oversized files rejected or compressed; limit communicated in the UI.

### REG-10 — Identity-document group: required indicator & labels 🟡 Medium
- **Current:** Two identity uploads (National ID/Iqama; Birth certificate) are `oneOf: identity` in logic, but neither shows a required marker — submission is silently blocked. Upload label omits Passport / GCC ID, which the document-type selector already offers.
- **Fix:** Show "one of the following is required" (asterisk + inline message); align upload labels with the type selector (National ID / Iqama / Passport / GCC ID).
- **Acceptance:** Empty submission produces a visible, specific error; labels list all accepted types.

### REG-11 — Weight validation 🟢 Low
- **Fix:** Tighten from the current 20–250 kg to a realistic Muaythai range, cross-checked against age/category.
- **Acceptance:** Clearly invalid weights rejected; validation consistent with REG-05 auto-category logic.

---

## C. Security & Infrastructure (P2)

### SEC-01 — Server-side validation for all registration input 🟠 High
- **Current:** All observed validation is client-side (yup + custom helpers); malformed API requests return HTTP 500 — suggesting no server re-validation. Every rule is bypassable by posting directly to the API.
- **Fix:** Enforce **all** rules (required fields, formats, age, weight, phone, ID) on the server; return proper 400-level validation errors.
- **Acceptance:** Direct malformed POSTs to registration endpoints return HTTP 400 with field-level errors, never 500.

### SEC-02 — API returns 500 on malformed input 🟠 High
- **Fix:** Validate request bodies on all public endpoints before processing; return HTTP 400 with a descriptive validation error. (Same root cause as SEC-01 — fix together.)
- **Acceptance:** Empty/malformed bodies to any public endpoint → 400, never 500.

### SEC-03 — Security response headers missing 🟠 High
- **Fix:** Add before launch, on both website and API: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`.
- **Note:** Staging is not behind Cloudflare and is not representative — **re-verify on the production domain** once behind the `saudimuaythai.sa` Cloudflare zone.
- **Acceptance:** `curl -I` on `/` and `/api/news` shows all six headers.

### SEC-04 — robots.txt & bot restrictions 🟠 High
- **Current:** `/robots.txt` returns the app shell (HTML); no bot restrictions exist.
- **Fix:** Serve a real `robots.txt`; block aggressive crawlers, SEO scrapers, and AI bots at server level; add `Disallow` for any admin/control route once it exists.
- **Acceptance:** `/robots.txt` returns a valid robots file; bot rules active; re-verify behind Cloudflare in production.

### SEC-05 — Production must sit behind the existing Cloudflare zone 🟠 High
- **Current:** Staging origin (nginx) is directly exposed — public IP visible in the sslip.io hostname, no `cf-ray` header. None of the federation's edge protections (WAF, rate limiting, Bot Fight Mode, SSL Full-Strict, edge HSTS) apply.
- **Fix at launch:** Deploy under `saudimuaythai.sa` behind the existing Cloudflare zone (proxied DNS) so edge protections carry over automatically. **Lock the origin firewall to Cloudflare's published IP ranges** so the edge cannot be bypassed. Never expose the origin IP publicly.
- **Acceptance:** Production responses show `Server: cloudflare` + `CF-RAY`; direct origin-IP requests are refused.

### SEC-06 — Server version banner disclosed 🟡 Medium
- **Fix:** Suppress `Server: nginx/<version>` in the web server config. (Auto-resolves behind Cloudflare, but suppress at origin anyway; re-verify in production.)
- **Acceptance:** No server version in any response header.

---

## D. Content, Features & UX (P3–P4)

### CNT-01 — Athlete cards use borrowed/stock photos of the wrong people 🟠 High
- **Affected:** Featured World Champions — Hattan Alsaif (Women's 54kg), Inad Baowaydhan (Men's Senior), Albaraa Alamoudi (Men's 57kg); Youth & Para — Fatimah Kashmiri, Aljawhara Alhazza (Para, Visual Impairment), Ali Alnasser (Para). Confirmed on homepage **and** `/organization/achievements`.
- **Hard evidence:** The Ali Alnasser card uses an event graphic showing two *different* athletes (Tami Al-Amri & Abdulaziz Al-Mubarrad) with their names burned into the image. The Aljawhara Alhazza card (female name) shows a male fighter.
- **Fix:** Replace every card with a real, licensed photo of the named athlete. Remove any image bearing another person's name immediately. Until a real photo exists, use a **neutral silhouette placeholder** — never a different person's photo (credibility + likeness/consent issue).
- **Acceptance:** No card shows a mismatched photo; placeholders used where real photos are pending.

### CNT-02 — Two news thumbnails swapped 🟡 Medium
- **Fix:** Swap the thumbnails between "Saudi Muaythai athletes shine in Thailand with four victories" (29 Jul 2026) and "Jazan Muaythai Championship" (26 Jul 2026), then **sweep every news thumbnail** for correct mapping (the same Thailand graphic was also misused on CNT-01).
- **Acceptance:** Every listing thumbnail matches its story.

### CNT-03 — News article template is nearly empty 🟡 Medium
- **Current:** `/news/:id` shows generic hero + title + source/date + one short paragraph + "All news" button. No featured image (though thumbnails exist in the data — a template gap), no category tag, no full body.
- **Fix — match at least the current live site:** 1) category badge (e.g. FEDERATION NEWS) 2) publication date 3) headline 4) lead/summary paragraph 5) prominent featured image below the intro 6) full multi-paragraph body 7) breadcrumb (Home > News > article) 8) "Back to News" nav. Optional: share buttons, related-news strip.
- **Acceptance:** `/news/1` renders the full layout with its featured image; matches or exceeds saudimuaythai.sa for the same article.

### CNT-04 — Achievements timeline: 2019 missing, 2021 wording wrong 🟡 Medium
- **Fix 1:** Add the **2019** block from the live site: *First Medal on the International Stage — Chungju, South Korea: Abdullah Alkahtani, Sultan Momen, Yousif Alharby — 3 bronze medals at the Chungju World Martial Arts Masterships, SMF's first international medals, won in its founding year.*
- **Fix 2:** Reword **2021** to: *"Azzam Al Omary: World Championship silver — the men's squad's first IFMA World Championship medal"* (not "first individual international medal", which 2019 disproves).
- **Acceptance:** Timeline includes 2019 and uses the corrected 2021 wording, AR + EN.

### CNT-05 — WhatsApp Community placeholder on Contact page 🟢 Low
- **Fix:** Replace "[ Community Link - Coming Soon ]" with the live link: `https://chat.whatsapp.com/IhBwcIcagZqArhmATQoaVG`
- **Acceptance:** Link works from `/contact`.

### CNT-06 — Header social media links point to wrong handles 🟡 Medium
Replace with the federation's real accounts:

| Platform | Correct URL |
|---|---|
| X | `x.com/smf_ksa` |
| Instagram | `instagram.com/smf__ksa/` |
| YouTube | `youtube.com/@SaudiMuayThaiFederation` |
| Snapchat | `snapchat.com/t/d0QLDkXr` |
| TikTok | `tiktok.com/@smf.ksa` |
| LinkedIn | `linkedin.com/company/saudimuaythai` *(already correct)* |
| WhatsApp | `wa.me/966552677377` *(already correct)* |

- **Acceptance:** All header icons resolve to real accounts; the conflicting second Snapchat link removed from the bundle.

### FEA-01 — Activities calendar: year navigation + grid view 🟡 Medium
- **Fix:** On `/activities/calendar`, add a **year toggle** plus a **view switch** between the current list layout and a simplified full-year grid, so the page works as a complete browsable activities archive across years.
- **Acceptance:** Users can open past years and switch list/grid.

### UX-01 — Contact form false success + no server validation 🟡 Medium
- **Current:** "Message sent successfully" shows while all required fields are empty (persisting success state, or empty submission accepted).
- **Fix:** Show success only after a validated successful submission; enforce required fields **server-side**. (Ties into SEC-01.)
- **Acceptance:** Fresh load shows no success banner; empty submit is blocked with field errors.

### UX-02 — Results-archive filter row misalignment 🟢 Low
- **Fix:** On `/organization/results-archive`, align the "Athlete name..." search input with the Year/Event/Medal dropdowns and Table/Timeline buttons — same height, baseline, spacing.
- **Acceptance:** Uniform control row.

### QA-01 — Orphaned routes 🟢 Low
- **Routes existing but unlinked:** `/try-muaythai`, `/governance/board`, `/governance/docs`, `/governance/staff`, `/about-muaythai/what-is-muaythai`
- **Fix:** For each: link it in navigation **or** remove it if unfinished. Confirm each is intentional and complete before launch.
- **Acceptance:** No orphaned routes remain.

---

## E. Arabic / English Content Corrections (P5) — TXT-01 → TXT-43

Apply each edit in **both language variants** where applicable. "Page" = where the text lives; "Current" = text on the site now; "Change to" = the required replacement or action.

### Global / structural
| # | Page | Current | Change to |
|---|---|---|---|
| TXT-01 | الرئيسية (Home) | «المملكة العربية السعودية» | **يحذف** (delete this text) |
| TXT-02 | تقويم الفعاليات | «وورش» | «ودورات» |
| TXT-03 | Site-wide (i18n layout) | عند التحويل من عربي لإنجليزي، خانة العربي تتحرك إلى صفحة خارجية | إعادة ترتيب خانات التحكم بشكل واضح للجميع (fix language-control layout so it is clear and consistent) |
| TXT-04 | تخصصات المواي تاي | «واي خرو» | «واي كرو» |
| TXT-05 | الأنظمة والقواعد | أنظمة بطولة تركيا | **حذف** — الاعتماد على لوائح الاتحاد الدولي (IFMA) فقط |

### Muaythai History page — replace/insert copy
| # | Section | New text |
|---|---|---|
| TXT-06 | تاريخ المواي تاي — intro line | «فن قتالي يمتد تاريخه عبر قرون، متجاوزًا حدود الزمان والمكان ليصبح رياضةً عالمية تحظى بالتقدير والانتشار.» |
| TXT-07 | تاريخ المواي تاي — body | «المواي تاي، والمعروفة أيضًا باسم الملاكمة التايلاندية، هي فن قتالي ورياضة قتالية يعود تاريخها إلى مئات السنين. نشأت في مملكة تايلاند كأسلوب للدفاع عن النفس خلال فترات الحروب والنزاعات، ثم تطورت مع مرور الوقت لتصبح رياضةً تحظى باحترام وممارسة واسعة حول العالم. وتتميز المواي تاي بمزجها الفريد بين الإرث الثقافي والأداء الرياضي، مما جعلها رمزًا للانضباط والاحترام والتقاليد، إلى جانب كونها واحدة من أكثر الرياضات القتالية تطورًا وانتشارًا على المستوى الدولي.» |
| TXT-08 | مراحل تطور المواي تاي — «الجذور التاريخية» | «يرتبط تاريخ المواي تاي ارتباطًا وثيقًا بتاريخ مملكة تايلاند، حيث نشأت في الأصل كأسلوب للقتال اليدوي والدفاع عن النفس. وقد تدرب المحاربون على المواي تاي لحماية أرضهم وشعبهم، حتى أصبحت تُعرف باسم "فن الأطراف الثمانية" لاعتمادها على استخدام القبضتين والمرفقين والركبتين والساقين، مما يجعلها واحدة من أكثر الفنون القتالية تنوعًا وفعالية» |
| TXT-09 | مراحل تطور المواي تاي — «العصر الحديث» | «مع دخول تايلاند القرن العشرين، انتقلت المواي تاي من ساحات القتال إلى المنافسات الرياضية المنظمة. وأُنشئت ملاعب عريقة مثل راجادامنيرن ولومبيني، مما أسهم في ترسيخ مكانة المواي تاي كرياضة احترافية. وفي أواخر القرن العشرين، حظيت اللعبة باعتراف دولي واسع، وانتشرت بين الرياضيين والجماهير حول العالم. كما ساهم تأسيس الاتحاد الدولي لجمعيات المواي تاي (IFMA) في توحيد القوانين، وتعزيز معايير السلامة، ودعم انتشار الرياضة عالميًا.» |
| TXT-10 | مراحل تطور المواي تاي — «الوقت الحاضر» | «أصبحت المواي تاي اليوم رياضةً تحظى بتقدير عالمي بفضل قيمتها الثقافية ومستواها الرياضي المتميز. وقد نالت اعترافًا من العديد من المنظمات الرياضية الدولية، وأصبحت حاضرة في بطولات عالمية مثل دورة الألعاب العالمية، كما أُدرجت في فعاليات استعراضية ضمن الألعاب الأولمبية، في خطوة تعكس تطورها المستمر وتمهد الطريق نحو حضور أولمبي كامل في المستقبل.» |
| TXT-11 | مراحل تطور المواي تاي — «في المملكة العربية السعودية» | «شكّل تأسيس الاتحاد السعودي للمواي تاي عام 2019 نقطة تحول في مسيرة رياضة المواي تاي بالمملكة. وبدعم من رؤية القيادة الرشيدة، وحصول الاتحاد على عضوية الاتحاد الدولي للمواي تاي (IFMA)، شهدت الرياضة نموًا ملحوظًا وانتشارًا واسعًا بين الشباب والنساء في مختلف مناطق المملكة. وعمل الاتحاد السعودي للمواي تاي على تنفيذ العديد من البرامج الهادفة إلى اكتشاف وصقل المواهب الوطنية، إلى جانب نشر رياضة المواي تاي في المدارس والجامعات. كما يواصل لاعبو ولاعبات المملكة تحقيق الإنجازات بحصد الميداليات في بطولات العالم للمواي تاي التي ينظمها الاتحاد الدولي (IFMA)، بما يعكس التطور المستمر للرياضة ومكانتها المتنامية على الساحة الدولية.» |
| TXT-12 | استكشف المواي تاي | «انطلق في رحلة عبر تاريخ المواي تاي العريق، من جذوره في تايلاند القديمة إلى مكانته اليوم كرياضة عالمية مزدهرة، تشهد نموًا متسارعًا ونجاحات متواصلة في المملكة العربية السعودية.» |

### Federation pages
| # | Page | Current | Change to |
|---|---|---|---|
| TXT-13 | نظرة عامة على الاتحاد | — | «الجهة الرياضية الوطنية المعنية بتنظيم رياضة المواي تاي، والإشراف على تطويرها ونشرها والارتقاء بها في المملكة العربية السعودية.» |
| TXT-14 | إنجازات الاتحاد — intro | — | «سجلٌ يوثق البطولات والميداليات والمحطات المؤسسية التي شكّلت مسيرة الاتحاد السعودي للمواي تاي ورسّخت حضوره على المستويين المحلي والدولي» |
| TXT-15 | إنجازات الاتحاد | «72 ميداليات» | «72 ميدالية» |
| TXT-16 | إنجازات الاتحاد | "Saudi Medals on the World Stage" (AR) | «الميداليات السعودية على الساحة العالمية» (وليس «المسرح») |
| TXT-17 | إنجازات الاتحاد | أخطاء بأسماء اللاعبين وصورهم وأسماء البطولات | **بانتظار ملف بيانات من الاتحاد** لتحديث كل المعلومات — track as blocked/awaiting-client-data |
| TXT-18 | الألعاب السعودية | «ذهبيو» | «الحاصدين على الذهب» |
| TXT-19 | الألعاب السعودية | «الطبعة» | «النسخة» |
| TXT-20 | الرئيسية — hero | «أهلاً بكم في بيت المواي تاي في المملكة العربية السعودية» | «مرحبًا بكم في المنصة الرسمية للاتحاد السعودي للملاكمة التايلندية» |

### Leadership names & titles (exact spellings required)
| # | Page | Current | Change to |
|---|---|---|---|
| TXT-21 | القيادة والكوادر الإدارية | «المهندس عبدالعزيز ألبنان» | «الرئيس التنفيذي م.عبدالعزيز بن إبراهيم آل بنان» |
| TXT-22 | عضو مجلس الإدارة | «السيد رايان غازي خميس الأحمد» | «م. ريان بن غازي خميس الأحمد» |
| TXT-23 | عضو مجلس الإدارة | «السيد خالد محمد سعد الجهني» | «العميد المتقاعد خالد بن محمد بن سعد الجهني» |
| TXT-24 | عضو مجلس الإدارة | «المهندس ناصر عبدالعزيز الموائبة» | «م. ناصر بن عبدالعزيز بن ناصر المعيبد» |
| TXT-25 | عضو مجلس الإدارة | «السيد بسام عباس أحمد اليماني» | «م. بسام بن عباس بن احمد اليماني» |
| TXT-26 | عضو مجلس الإدارة | «السيد عمر أحمد الغامدي» | «الأستاذ عمر احمد الغامدي» |
| TXT-27 | الاتحاد / أقسام الاتحاد / مجلس الإدارة | قسم «الكوادر الإدارية والتشغيلية» | **إزالة القسم بالكامل** (عربي + إنجليزي) |
| TXT-28 | الاتحاد / تاريخ الاتحاد | «الأمير فهد آل سعود، رئيس الاتحاد السعودي للملاكمة التايلندية» | «الأمير فهد بن منصور بن سعد بن سعود آل سعود» *(appears in two locations — fix both)* |
| TXT-29 | الحوكمة › اللجان | فريق «اللجان الدائمة» ضمن الهيكل التنظيمي | **إزالة فريق اللجان** (عربي + إنجليزي) |

### Governance & terminology
| # | Page | Current | Change to |
|---|---|---|---|
| TXT-30 | الحوكمة › الصحة | «مكافحة الدوبينغ» | «مكافحة المنشطات» (page title + breadcrumb) |
| TXT-31 | الحوكمة › الصحة — الهيئات المرجعية | «الوكالة العالمية لمكافحة الدوبينغ (WADA)» | «الوكالة العالمية لمكافحة المنشطات (WADA)» |

### Registration & Activities terminology
| # | Page | Current | Change to |
|---|---|---|---|
| TXT-32 | التسجيل | «تسجيل رياضي» | «تسجيل لاعب» |
| TXT-33 | التسجيل | «تسجيل ناد» | «تسجيل نادي» |
| TXT-34 | الأنشطة | «ورش والتعليم» | «تدريب» |
| TXT-35 | الأنشطة | «بطولات إقليمية» | «بطولات داخلية» |
| TXT-36 | الأنشطة | «منافسات دولية» | «بطولات دولية» |
| TXT-37 | الأنشطة | «بطولة جدة الإقليمية» | «بطولة جدة داخلية» |
| TXT-38 | الأنشطة | «بطولة جيزان الإقليمية» | «بطولة جيزان داخلية» |
| TXT-39 | الأنشطة | «بطولة خبر الإقليمية» | «بطولة خبر داخلية» |
| TXT-40 | مجلس الإدارة | «الرئيس وأعضاء مجلس الإدارة» section | إزالة فريق «الكوادر الإدارية والتشغيلية» (duplicate of TXT-27 — verify both instances) |

> **Blocked item:** TXT-17 depends on a data file from the federation (athlete names, photos, championship names). Log it as *Awaiting client data* and do not guess.

---

## F. Paste-Ready Claude Code Execution Prompts

### Prompt 1 — P0 + Registration overhaul (REG-01 → REG-11)
```
You are working on the SMF (Saudi Muaythai Federation) website — a bilingual (Arabic RTL / English LTR) React SPA with a backend API. Execute the following, in order, committing per logical unit:

1. ROUTING BLOCKER: Users cannot navigate between /registration/athlete, /registration/club, /registration/coach, /registration/official — the URL flips then reverts. Find the route guard / redirect effect causing this and fix it so all four forms are freely navigable. Regression-test the AR<->EN language toggle after the fix.

2. DATA STANDARDS (all registration forms): phone stored as E.164 (+966XXXXXXXXX default), nationality as ISO 3166-1 alpha-2 (replace the fixed Gulf list with the full ISO country list), dates as ISO 8601, names as three parts (given/father/family) in BOTH Arabic and English (6 fields, replacing the two combined full-name fields).

3. VALIDATION (client AND server): Arabic-script-only on Arabic name fields, Latin-only on English name fields, multi-part names required (athlete + club forms). Phone: country-code selector defaulting +966, E.164 output, updated placeholders/errors. Age: athlete 6–45, coach >=18, referee >=18. Referee officiating details required. Weight: realistic Muaythai range cross-checked against age/category. Auto-calculate athlete category (Junior/Youth/Senior/Elite/Para) from age+weight+gender.

4. IDENTITY DOCS: the oneOf identity group (National ID/Iqama OR Birth certificate) must show a visible "one of the following is required" indicator and inline error; align upload labels with the type selector (National ID / Iqama / Passport / GCC ID).

5. UPLOADS: cap at ~1MB with automatic image compression before storage; surface the limit in the UI.

6. CONFIRMATION EMAIL: on successful submission send an email with a unique reference number (format SMF-A-2026-00003 style, per registration type), using the baseline copy in the requirements doc; store the reference with the application.

All error messages and labels must exist in both Arabic and English. All rules enforced server-side with HTTP 400 field-level errors (never 500).
```

### Prompt 2 — Security hardening (SEC-01 → SEC-06)
```
Harden the SMF website and API:

1. Server-side validation on every public endpoint — malformed/empty bodies must return HTTP 400 with descriptive field errors, never 500. Mirror all registration rules on the server.
2. Add security response headers to website AND API: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy, Permissions-Policy.
3. Serve a real /robots.txt (currently returns the SPA shell); block aggressive crawlers/SEO scrapers/AI bots at server level; Disallow any admin routes.
4. Suppress the nginx version banner (server_tokens off).
5. Document the launch runbook: deploy under saudimuaythai.sa behind the existing Cloudflare zone (proxied DNS) so WAF/rate-limiting/Bot Fight Mode/SSL Full-Strict/edge HSTS carry over; lock the origin firewall to Cloudflare's published IP ranges; never expose the origin IP.
Verify each with curl -I and malformed-body tests; re-verify headers on production after Cloudflare cutover.
```

### Prompt 3 — Content, features & UX (CNT, FEA, UX, QA items)
```
Fix the following content and UX issues on the SMF website (both languages):

1. ATHLETE PHOTOS: on the homepage National Team section and /organization/achievements, replace all six named-athlete card photos (Hattan Alsaif, Inad Baowaydhan, Albaraa Alamoudi, Fatimah Kashmiri, Aljawhara Alhazza, Ali Alnasser) with a neutral silhouette placeholder until real licensed photos are provided. Remove immediately the image carrying other athletes' burned-in names.
2. NEWS THUMBNAILS: swap the Thailand (29 Jul 2026) and Jazan (26 Jul 2026) article thumbnails back to the correct stories; audit every news thumbnail mapping.
3. NEWS DETAIL TEMPLATE (/news/:id): render category badge, date, headline, lead paragraph, featured image (data already exists — template isn't rendering it), full multi-paragraph body, breadcrumb (Home > News > article), Back to News link. Optional: share buttons + related news.
4. ACHIEVEMENTS TIMELINE: add the missing 2019 block (Chungju, South Korea — Abdullah Alkahtani, Sultan Momen, Yousif Alharby, 3 bronze — SMF's first international medals); reword 2021 to "Azzam Al Omary: World Championship silver — the men's squad's first IFMA World Championship medal".
5. SOCIAL LINKS in header: X x.com/smf_ksa · IG instagram.com/smf__ksa/ · YT youtube.com/@SaudiMuayThaiFederation · Snap snapchat.com/t/d0QLDkXr · TikTok tiktok.com/@smf.ksa (LinkedIn + WhatsApp already correct). Remove the conflicting second Snapchat link.
6. CONTACT: replace "[ Community Link - Coming Soon ]" with https://chat.whatsapp.com/IhBwcIcagZqArhmATQoaVG; fix the false "Message sent successfully" state (show only after a validated successful submission; validate server-side).
7. ACTIVITIES CALENDAR (/activities/calendar): add a year toggle and a list/grid view switch so it works as a browsable multi-year archive.
8. RESULTS ARCHIVE (/organization/results-archive): align the athlete-name search input's height/baseline/spacing with the other filter controls.
9. ORPHANED ROUTES: /try-muaythai, /governance/board, /governance/docs, /governance/staff, /about-muaythai/what-is-muaythai — link each in navigation or remove if unfinished; report which action you took for each.
```

### Prompt 4 — Arabic/English copy pass (TXT-01 → TXT-40)
```
Apply the site-wide text corrections listed in Section E of SMF-Website-Fix-Requirements.md exactly as written (exact Arabic spellings, honorifics, and diacritics — do not paraphrase). Key groups:
- Delete/replace items TXT-01→TXT-05 (home hero cleanup, "ودورات", language-control layout, "واي كرو", remove Turkey championship rules keeping IFMA only).
- Replace Muaythai History page copy with TXT-06→TXT-12 blocks verbatim.
- Federation pages TXT-13→TXT-20 (overview blurb, achievements intro, "72 ميدالية", "الساحة العالمية", "الحاصدين على الذهب", "النسخة", new home hero line TXT-20).
- Leadership names TXT-21→TXT-28 verbatim, including the Prince's full name in BOTH locations; remove the "الكوادر الإدارية والتشغيلية" team section and the committees team section (AR + EN) per TXT-27/29/40.
- Terminology TXT-30→TXT-39 ("مكافحة المنشطات" not "الدوبينغ" incl. WADA line; "تسجيل لاعب"، "تسجيل نادي"؛ "تدريب"، "بطولات داخلية/دولية" and the three city championships renamed to "داخلية").
Skip TXT-17 (awaiting a client data file for athlete names/photos/championships) — leave a TODO marker referencing it.
After the pass, run both language variants and screenshot each changed page for review.
```

---

## G. Regression & Launch Checklist

- [ ] Language toggle AR↔EN works bidirectionally on every page (previously Critical — retest after all routing/i18n changes)
- [ ] All four registration forms navigable and submitting with server-validated data
- [ ] Malformed API requests → 400 across all endpoints
- [ ] Security headers present (re-verify on production behind Cloudflare)
- [ ] robots.txt real + bot rules active
- [ ] Origin locked to Cloudflare IPs at launch; no origin IP exposure
- [ ] No mismatched athlete photos anywhere
- [ ] News thumbnails audited; news detail template complete
- [ ] Achievements timeline includes 2019; 2021 wording corrected
- [ ] All TXT items applied verbatim in AR + EN; TXT-17 tracked as awaiting client data
- [ ] Confirmation emails sending with unique reference numbers
