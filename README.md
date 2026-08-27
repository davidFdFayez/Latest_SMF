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
   - Bilingual (Arabic/English) page content for `home`, `overview`, `history`, `values`, `strategy`, `initiatives`, `goals`, and `achievements`
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

### API overview

**Public:**
- `GET /api/pages/{slug}?lang=ar|en` — bilingual page content (`slug` ∈ overview, history, values, strategy, initiatives, goals, achievements, home)
- `GET /api/news?lang=&category=&page=&pageSize=`, `GET /api/news/{id}`
- `GET /api/events?lang=&category=`
- `GET /api/results?year=&event=&medal=&search=`, `GET /api/results/stats`
- `GET /api/settings`
- `POST /api/registrations`, `POST /api/contact`, `POST /api/whistleblower`
- `POST /api/registrations/attachments` — multipart upload of one registration document

**Admin (JWT required):**
- `GET /api/admin/dashboard`
- Full CRUD: `/api/admin/news`, `/api/admin/events`, `/api/admin/results`, `/api/admin/pages/{slug}`
- Read/manage: `/api/admin/registrations`, `/api/admin/contact-messages`, `/api/admin/whistleblower`, `/api/admin/settings`
- `GET /api/admin/registrations/statuses` — the request lifecycle vocabulary
- `GET /api/admin/registrations/{id}/attachments/{attachmentId}` — download a submitted document

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
it. Both public registration endpoints are rate limited to 30 requests per 10 minutes
per client address.

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
