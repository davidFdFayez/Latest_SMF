# Saudi Muaythai Federation (SMF) — Monorepo

This repository contains three applications that together make up the SMF digital platform:

| App | Path | Tech | Default URL |
|---|---|---|---|
| **Backend API** | `backend/Smf.Api` | .NET 10 Minimal API + EF Core + SQLite | http://localhost:5080 |
| **Public website** | `web` | React 19 + Vite | http://localhost:5173 |
| **Admin dashboard** | `admin` | React 19 + Vite | http://localhost:5174 |

Both frontends proxy `/api/*` requests to the backend at `http://localhost:5080` (see each app's `vite.config.js`), and the backend's CORS policy explicitly allows `http://localhost:5173` and `http://localhost:5174`.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/) and npm

## 1. Run the backend API

```bash
cd backend/Smf.Api
dotnet restore
dotnet run
```

The API listens on **http://localhost:5080**. On first run it will:

1. Create a local SQLite database file (`smf.db`) via `EnsureCreated()`.
2. Seed it with:
   - An admin user — username `admin`, password `Admin@123`
   - All 72 historical medal results (from `results.json`)
   - 3 sample news articles and 5 sample events (Aug–Sep 2026)
   - Site settings (federation name, email, phone, address, socials)
   - **Development only:** 7 demo clubs for the public `/clubs` directory (see below)

Re-running the app is safe — seeding only happens when the relevant tables are empty. Delete `smf.db` (and the `-shm`/`-wal` files) to force a full reseed.

### Demo clubs

The public "Try Muaythai" directory at `/clubs` lists club registrations with
status `approved`, so it is empty until the federation approves a real one. To
keep it from looking broken during development, `SeedData.SeedClubs` inserts 7
fabricated clubs across 6 regions.

These are **not seeded outside `Development`**. They are published on a public
page, and a visitor could otherwise try to contact or drive to a facility that
does not exist. Their email and website addresses are all under `example.com`,
which RFC 2606 reserves so it can never resolve to a real organisation, and no
owner names, ID numbers, or personal mobiles are invented — the directory never
publishes those fields.

- Override the environment gate with `Seed:DemoClubs` (`true` to force them on
  for a staging demo, `false` to keep a dev database clean).
- Seeding is skipped entirely once **any** club registration exists, of any
  status — a real application awaiting review is never joined by demo rows.
- Each demo row carries an internal note marking it as demo data and a
  `SMF-CLUB-00n` membership number, so they are easy to spot and delete in the
  admin dashboard. Deleting all of them re-seeds on the next dev restart.

Interactive API docs (OpenAPI/Scalar) are available at `/openapi/v1.json` in the `Development` environment. A ready-made `Smf.Api.http` file is also included for use with the VS Code/Rider HTTP client.

### Configuration

Key settings live in `backend/Smf.Api/appsettings.json`:

```json
{
  "ConnectionStrings": { "DefaultConnection": "Data Source=smf.db" },
  "Jwt": {
    "Secret": "...",
    "Issuer": "Smf.Api",
    "Audience": "Smf.Clients",
    "ExpiryMinutes": 480
  }
}
```

Change the `Jwt:Secret` before deploying anywhere beyond local development.

### Authentication

`POST /api/auth/login` with `{ "username": "admin", "password": "Admin@123" }` returns a JWT bearer token. Send it as `Authorization: Bearer <token>` to any `/api/admin/*` endpoint.

### Users, roles & permissions

Admin accounts are managed from the dashboard under **Users** and **Roles & Permissions**.

- **Permissions** are fixed in code (`Data/AdminPermissions.cs`) because each one is only meaningful where an endpoint checks it — e.g. `news`, `events` (events and medal results), `content.publish` (static pages), `support` (contact messages), `whistleblower`, `settings`, `users`, `permissions`, and the eight §6 membership actions `membership.view` … `membership.export`.
- **Roles** live in the database and bundle permissions. The §17 team roles and the §6 membership roles are seeded on first run, and existing accounts' old single role is carried over automatically. **Super Admin** (`*`) is locked: it can't be deleted or have its permissions changed.
- **Users** can hold several roles; their access is everything those roles grant combined.
- Permissions are re-read on every request, so a role change or a deactivation takes effect immediately, not when the token expires.
- Nobody can grant more than they hold: you can only assign roles, or grant permissions, that you hold yourself, and only edit or reset the password of accounts whose permissions you cover. You can't change your own roles or deactivate yourself.
- In Development, if no active account holds Super Admin, the `admin` account is reactivated and given it on startup. Elsewhere this is only logged.

### Applicant notifications

The approved workflow (§6) requires a message to the applicant at every step —
submission, completion request, approval, rejection, renewal, expiry,
suspension — by email **and** SMS.

- Delivery needs configuration. Without `Email:Host`, every message is written
  to `Email:OutboxPath` (default `<contentRoot>/data/outbox`) instead of being
  sent, and the API logs a warning at startup. SMS behaves the same way via
  `Sms:Provider` / `Sms:OutboxPath`.
- Every attempt is recorded, whatever the outcome: **Memberships → open a
  request → Notifications** shows the channel, recipient, template, and whether
  it was sent, held in the outbox, failed (with the provider's error), or
  skipped because the applicant left no address or number.
- `GET /api/admin/notifications/status` reports whether each channel is
  configured plus 30-day counts, so the console can warn when nothing can
  actually leave the server.

### Password reset

Administrators reset their own password from the sign-in page.

- **Users → edit → Email address** must be set first; an account without one
  cannot receive a link.
- A link is valid for `Admin:PasswordResetExpiryMinutes` (default 60), can be
  used once, and is voided by requesting another. Only its hash is stored.
- `Admin:BaseUrl` builds the link, so it must point at the console.
- Both endpoints answer identically for unknown accounts, and are rate limited
  to 8 attempts per 15 minutes per address.
- Completing a reset — or an administrator setting someone's password — ends
  that account's existing sessions immediately.

### Activity log

**Activity Log** in the console (permission `users` or `permissions`) shows the
audit trail across memberships, users, roles, website content, news, and events:
who did what, to which record, and when. Refused actions are recorded too.

### Membership term

**One year** for every track — athlete, coach, referee and club alike. The
Phase 2 document originally read "مدة العضوية / الرخصة: 3 سنوات"; the federation
corrected it to a single year for all categories (tracker BUG-12). Override
without touching code if that changes again:

```
Membership__TermYears__default=1     # every track
Membership__TermYears__official=2    # one track: athlete | coach | official | club
```

A membership set to **Expired** has its term closed on the spot, so every screen
reports it as expired with zero days remaining rather than counting down a term
that no longer applies.

Changing the term governs what is approved from then on; memberships already
issued keep the end date they were given. To find and correct those:

```
GET  /api/admin/registrations/term-mismatches          # preview — needs membership 'view'
POST /api/admin/registrations/term-mismatches/realign  # apply   — needs membership 'approve'
```

The preview lists each membership with the date it holds and the date the current
term gives it. Applying moves them and writes one audit entry per record, naming
the date it moved from. Only approved memberships are touched — an expired,
suspended, or cancelled record is history, and rewriting its dates would falsify
it. Nothing runs automatically: this rewrites when people's memberships end, so
somebody has to ask for it.

### Website content

The text, images, and links on the public website are edited in the dashboard under **Website Content** (permission `content.publish`; the site-wide entries — contact details, social accounts, menu and footer labels — need `settings`).

- Each page or site-wide block is one definition file in `backend/Smf.Api/Data/Content/<key>.json`: its admin form (`schema`) and its original text (`content`). The files are embedded in the API and checked at startup — a malformed one stops the API with a message naming the problem.
- The database (`ContentEntries`) holds only what has been edited. A page nobody has touched serves its defaults; **Restore original** in the editor deletes the edit.
- The public site reads `GET /api/content/{key}` (or `GET /api/content?keys=a,b`) and caches the result in the browser, so returning visitors see pages instantly.
- Images and PDFs uploaded in the editor are stored beside the database (`data/uploads/media`, overridable with `Storage:MediaPath`) and served from `/api/media/{name}`. JPG, PNG, WEBP, GIF, and PDF only, up to 10 MB (`Storage:MediaMaxBytes`); the file's bytes must match its extension.
- Links in content must be a site path, `https://`, `mailto:`, or `tel:`; anything else is refused on save.
- To make a new part of a page editable: add the field to the definition's `schema` and its current text to `content`, then read it in the page with `usePageContent('<key>')` and `useText()` (see `web/src/content/useContent.jsx`). Saved edits made before the field existed keep working — missing fields fall back to the defaults.

Not editable from the dashboard (by design): the registration form fields (`web/src/data/registrationPortal.js`), event and news category names, and interface wording such as breadcrumbs, form validation messages, and loading/empty states.

### API overview

**Public:**
- `GET /api/content/{key}`, `GET /api/content?keys=a,b` — editable website content (see "Website content")
- `GET /api/media/{name}` — an uploaded image or document
- `GET /api/news?lang=&category=&page=&pageSize=`, `GET /api/news/{id}`
- `GET /api/events?lang=&category=`
- `GET /api/results?year=&event=&medal=&search=`, `GET /api/results/stats`
- `GET /api/settings`
- `POST /api/registrations`, `POST /api/contact`, `POST /api/whistleblower`
- `POST /api/registrations/attachments` — multipart upload of one registration document

**Admin (JWT required):**
- `GET /api/admin/dashboard`
- Full CRUD: `/api/admin/news`, `/api/admin/events`, `/api/admin/results`
- `/api/admin/content` (list), `/api/admin/content/{key}` (get schema + content, `PUT` save, `DELETE` restore original), `POST /api/admin/media` (upload)
- `POST /api/admin/registrations/{id}/reopen` — return a rejected or cancelled request to review (needs `approve` and a reason)
- `GET /api/admin/registrations/{id}/notifications` — what was sent to this applicant, and what happened to it
- `GET /api/admin/notifications/status`, `GET /api/admin/notifications` — delivery configuration and recent attempts
- `GET /api/admin/audit` — the audit trail, filterable by entity type, action, actor and text

**Public (no token):**
- `POST /api/auth/forgot-password`, `GET /api/auth/reset-password/{token}`, `POST /api/auth/reset-password` — self-service password reset (rate limited)
- Read/manage: `/api/admin/registrations`, `/api/admin/contact-messages`, `/api/admin/whistleblower`, `/api/admin/settings`
- `GET /api/admin/registrations/statuses` — the request lifecycle vocabulary
- `GET /api/admin/registrations/{id}/attachments/{attachmentId}` — download a submitted document
- `GET /api/auth/me` — the signed-in account's current roles and permissions
- `/api/admin/users` (list, get, create, update) and `POST /api/admin/users/{id}/password` — requires `users`
- `/api/admin/roles` (full CRUD) — requires `permissions` (listing also allowed with `users`)
- `GET /api/admin/access/permissions` — the permission catalogue, grouped

### Registration portal

`/registration` lists the four categories; `/registration/{athlete|coach|referee|club}`
opens a five-step wizard (category → basic details → contact → category details →
documents & review). The form is bilingual, keeps a draft in `localStorage`, and only
shows the fields and documents that apply to the chosen category — including the
guardian block that appears automatically when the athlete's date of birth puts them
under 18.

Submissions are created with status `new` and a reference number of the form
`SMF-{A|T|O|C}-{yyMMdd}-{id}`. The declaration checkbox is enforced server-side: a
payload without `consent` is rejected, as is one without a valid email and a mobile
number.

Documents are uploaded one at a time as the applicant selects them and are stored on
disk — **not** in the database — under `Storage:RegistrationUploadsPath`, which defaults
to `<contentRoot>/data/uploads/registrations`. In Docker that path sits inside the
`smf-api-data` volume alongside `smf.db`, so uploads survive a redeploy. Accepted types
are JPG, PNG, WEBP, and PDF up to 8 MB each. The submitted payload references the stored
file ids, and a document can only be downloaded through the registration that references
it. Both public registration endpoints are rate limited — 30 requests per 10 minutes
per client address by default, and configurable with
`RateLimits__PublicRegistration__PermitLimit` and `__WindowMinutes`.

#### Age rules and the competition category

An athlete is never asked which category they compete in: it is calculated from the
date of birth, on the server, and whatever a client sends for it is discarded. The
eligibility age is **the competition year minus the birth year**, as the federation's
"Competition Category – Age Eligibility Rules" specifies, so everyone born in the same
year competes together:

| Category | Age | | Category | Age |
|---|---|---|---|---|
| U8 | 6–7 | | U18 | 16–17 |
| U10 | 8–9 | | U24 | 18–23 |
| U12 | 10–11 | | Elite | 18–40 |
| U14 | 12–13 | | Masters | 35–50 (bands 35–39, 40–44, 45–50) |
| U16 | 14–15 | | | |

The stored payload carries `athleteCategory` (the assignment), `eligibleCategories`
(every category that age may enter) and `mastersBand` where it applies. The age-group
ladder wins where it applies — an 18-to-23-year-old is U24, and Elite only becomes the
assignment from 24 — and a reviewer editing a request may move an athlete between the
categories their age allows, but no further. Athletes under 18 are never eligible for
Elite, enforced separately from the table. A date of birth that falls in no category at
all is refused.

Other rules the portal and the API both apply: a coach must be **21 or older**, with no
upper limit; a club application needs a **Google Maps link** but not a district; and no
numeric field anywhere accepts a negative value — not through the stepper, not typed,
and not through a direct POST.

The tables live in `backend/Smf.Api/Data/CompetitionCategories.cs` and
`web/src/data/registrationPortal.js`. They mirror each other: a change to one is a
change to both.

#### News images

The article page shows an uploaded picture **whole** — its own proportions, no
crop. List and home-page cards are a fixed 16/9 tile, which a photo of another
shape cannot fill without losing its edges, so the news editor sets a **focal
point**: click the subject in the picture and the card crops around it. The
preview beside it is the real card, same ratio and same `object-position`.
Stored per article as two percentages; anything unset or unreadable falls back
to the old default of centred and a third down.

The console proxies `/assets/uploads/` to the public site (in `admin/nginx.conf`,
and in the dev server via `SMF_WEB_PROXY`) so that pictures held there can be
previewed while editing — without it the editors have nothing to show.

#### Documents on a submitted request

A reviewer with `edit` can add, replace, or remove the documents on a request from the
review screen (`POST`/`DELETE /api/admin/registrations/{id}/attachments`). Uploading
into a slot that already holds a file replaces it and deletes the old one. Both actions
are recorded in the activity log — these are the applicant's identity documents, so who
changed one matters.

### Beneficiary profiles

**Beneficiary Profiles** in the console lists athletes, coaches, referees and clubs as
people and organisations rather than as application forms. Someone who applied twice —
after a rejection, say — is one profile with two applications, not two rows.

A profile is derived from the registrations rather than stored, so it can never fall out
of step with them: identity is the national/residency/passport number for a person and
the official email for a club, and the current record is the most recent application
that has not been rejected or cancelled. The profile shows the membership and its
validity, the identity and contact details, the documents on file, and every application
behind it, each linking back to its review page.

`GET /api/admin/members` (filters: `type`, `status`, `search`) and
`GET /api/admin/members/{id}`, both needing membership `view`.

#### The member's own card

A profile answers "who is this?" for a reviewer in the console. A **membership
card** answers it for everyone else — the member wanting proof of registration,
and the official on a competition door deciding whether to let them through.

Each approved membership gets one unguessable link, `/membership/{token}`, with
a QR code to scan it. The page shows the name, photo, membership number,
competition category and whether the membership is in date; it deliberately
carries **no identity number, phone, email, date of birth or guardian details**,
because an unguessable URL is still a public one. It needs no sign-in — a card
you have to log in to show is not a card — and it is served `noindex` and rate
limited.

The token is issued on approval and survives renewal, so a printed card keeps
working. **Issue a new link** on the profile or the review screen replaces it,
which is the only way to revoke a card that has been passed on; it is audited.

```
Site__BaseUrl=https://saudimuaythai.sa   # card links and their QR codes are built from this
```

Get that wrong and you print cards that lead nowhere, so it is set per
environment alongside `Admin__BaseUrl`.

The QR is generated by the API (`/api/membership-card/{token}/qr.svg`) rather
than by either front end, so one implementation serves the printed card and the
screen. It is a self-contained encoder in `Services/QrCode.cs` — byte mode,
error correction M, versions 1–10 — checked module-for-module against an
independent encoder across every mask and version in range.

The pledge, declaration, and medical-examination forms are deliberately **not** part of
general registration — per §10 they are collected at competition time.

### Schema drift on existing databases

The API builds its schema with `EnsureCreated()`, which runs once and then never updates
an existing `smf.db`. `SqliteSchemaGuard` runs immediately afterwards, compares the model
against the live schema, and adds any missing columns. It is additive and idempotent — it
never drops, renames, or retypes anything. If you add a property to a model, it will be
added to existing databases on the next start; anything beyond that (dropping columns,
changing types, data backfills) still needs a real migration.

## 2. Run the public website

```bash
cd web
npm install
npm run dev
```

Opens at **http://localhost:5173**.

## 3. Run the admin dashboard

```bash
cd admin
npm install
npm run dev
```

Opens at **http://localhost:5174**.

## Running everything together

Start the three apps in separate terminals, in this order: backend first, then `web` and `admin`. Once all three are running:

- Visit http://localhost:5173 for the public site.
- Visit http://localhost:5174 for the admin dashboard (log in with `admin` / `Admin@123`).

## Project structure

```
backend/Smf.Api/        .NET 10 Web API (Minimal APIs, EF Core + SQLite, JWT auth)
  Data/Models/           Entity classes
  Data/SmfDbContext.cs   EF Core DbContext
  Data/SeedData.cs       Startup seed data (bilingual content, results, news, events...)
  Endpoints/             Minimal API endpoint groups (public + admin)
  Services/              JWT token issuing + password hashing
web/                     Public-facing React site
admin/                   Admin dashboard React app
shared-assets/           Shared images/CSS/JS referenced by the legacy site mirror
```

## Phase 3 — running a tournament

The journey the signed Phase 3 Part 1 document describes, from creating a
tournament to scheduling its bouts. `docs/PHASE3-PART1-PLAN.md` maps each
requirement to where it lives.

**In the console**, under **Tournaments**:

1. **Set up** — name, type, location, days, and the categories, genders and
   weight classes it runs. Those three choices generate the *divisions*
   (category × gender × weight class), which is the unit everything downstream
   works in. Publishing opens entries; they close seven days before by default
   and can be extended.
2. **Entries** — the readiness desk. One queue: check in, record the
   examination, record the weigh-in, approve. A pass given with documents
   missing needs a reason, and the reason is recorded against the person who
   gave it. A weight outside the entered class cannot simply be passed — move
   the athlete to a class that fits, or fail them.
3. **Draw** — single elimination per division, from the qualified pool only.
   Byes bring the field to the next power of two and are placed by the
   document's rules; club-mates are kept apart where that is possible. A
   published draw can be redrawn or amended, with a reason, and every change is
   logged. A withdrawal before the draw removes the athlete; after it, their
   opponent advances as a walkover.
4. **Schedule** — rings are added here, not at setup. Each ring keeps its own
   start time, interval and order, so several run side by side. Times are
   generated, bout numbers run through the rings within a day and continue into
   the next, and a bout moved to another ring by hand stays there when the
   schedule is regenerated. The screen reports any athlete who would be in two
   places at once, or without the two hours' rest the rules require.

**For members**, at `/account`: clubs, coaches and athletes sign in with an
email address and a password. A club invites its athletes and coaches by email
— an address that already has an account is attached straight away, otherwise
an invitation goes out and shows as pending. A coach sees the same roster and
invites nobody. An athlete sees their own record, their medical file and the
tournaments they may enter. Anything an account holder changes about their own
details waits for the federation to approve it.

Member accounts use a **separate authentication scheme** with its own audience,
so a member's token fails validation on the console's API rather than merely
lacking permission there.

```
Site__BaseUrl=https://saudimuaythai.sa       # invitation and card links
RateLimits__MemberAuth__PermitLimit=30       # sign-ins per window, per address
RateLimits__MemberAuth__WindowMinutes=5
```

### Competition categories

Eleven, in three tracks. An athlete competes in **one track only**, and chooses
when more than one is open to them. Age is the competition year minus the birth
year.

| Track | Categories |
|---|---|
| Development | U8 (6–7), U10 (8–9), U12 (10–11), U14 (12–13), U16 (14–15), U18 (16–17), U24 (18–23) |
| Elite | Elite (18–40) |
| Masters | Masters 35+ (35–39), Masters 40+ (40–44), Masters 45+ (45–50) |

> **The weight classes are provisional.** The document requires the
> federation's official classes per age category and gender but does not list
> them, and the attachment it refers to has not arrived. `WeightClasses.cs`
> holds a stand-in built from the IFMA ladder. The classes a tournament
> actually runs are chosen at setup and stored as its own divisions, so
> replacing that file later leaves existing tournaments untouched.
