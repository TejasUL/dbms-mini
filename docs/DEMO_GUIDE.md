# bSafe — Demo Guide

A step-by-step script for showing the project and explaining **both layers** (frontend UI and backend API) in about 10 minutes.

> This build is one Next.js server, not two processes. The original project used a Vite frontend + NestJS API. Here Next.js serves the pages **and** the `/api` route handlers from the same Node process. In the demo, call them the **frontend layer** and the **backend/API layer** — the separation is still real in the code.

---

## 0. One-sentence explanation

> bSafe is a silent SOS web app: one discreet tap alerts trusted contacts with a tokenized live-location link, tracks the alert through `sent → acknowledged → resolved`, and gives admins a read-only monitoring dashboard.

---

## 1. What to open before the demo

Run these from `C:\Users\Tejas\dbms-mini`:

```powershell
# one-time setup (safe to repeat)
npm install
Copy-Item .env.example .env
npm run setup

# clean demo data (optional but recommended before an exam)
npm run db:reset

# start the app through nodemon → next dev
npm run dev
```

Open:

| Window | URL / command | Purpose |
| --- | --- | --- |
| Browser window 1 | <http://localhost:3000> | User's app (Priya) |
| Browser window 2 (private/incognito) | tracking link printed in terminal | Contact's public tracking page |
| Browser window 3 (private/incognito) | <http://localhost:3000> → admin login | Admin dashboard |
| Terminal | `npm run dev` output | Shows API requests + dry-run emails with tracking links |
| Optional terminal | `npm run db:studio` | Prisma Studio at <http://localhost:5555> to show tables |

Check the API is alive before you present:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
# {"status":"ok","database":"connected","auth":"cookie"}
```

### Demo accounts

| Email | Password | Role |
| --- | --- | --- |
| `priya@example.com` | `Password123!` | User with 5 contacts and alert history |
| `arjun@example.com` | `Password123!` | User with 1 contact and an active alert |
| `admin@bsafe.test` | `Password123!` | Admin |

### Where the tracking link comes from

Email delivery is **dry-run by default**. After triggering an SOS, the terminal prints one line per contact:

```text
[email dry-run] to=sunita.mum@example.com subject="bSafe SOS from Priya Sharma" link=http://192.168.1.20:3000/track/<token>
```

The link uses the address the app was opened on, falling back to this machine's LAN IP when opened via `localhost`, so a phone on the same network can actually open it. (`WEB_BASE_URL` overrides this for tunnels/domains.)

Copy that `link` into browser window 2. If the logs have scrolled, open Prisma Studio → `alerts` table → copy `tracking_token` and open `http://<LAN-IP>:3000/track/<token>`.

---

## 2. The 10-minute demo script

### Step 1 — Login (30s)

Open <http://localhost:3000>. You are redirected to `/login` because `proxy.ts` protects every page except `/login` and `/track/*`.

Say:

> Authentication is local email/password. Passwords are hashed with bcrypt, and the session is a signed JWT in an HttpOnly cookie — no Firebase and no token in `localStorage`.

Sign in as `priya@example.com` / `Password123!`.

### Step 2 — Contacts (1 min)

Click **Contacts**.

Show:

- 5 seeded trusted contacts and the `5/5 SLOTS` indicator.
- Phone must be E.164 (`+919876543210`); email is required.
- Add/edit/remove forms.
- Duplicate phone or email is rejected with `409`.
- A 6th contact is rejected with `400` because the service caps contacts at 5.

Say:

> Contacts are user-scoped. Every read/write checks ownership. The list is cached for 30 seconds and invalidated after any write.

### Step 3 — Profile (20s)

Click **Profile**. Show name/phone editing and the account email. The admin account also shows an `ADMIN` badge.

### Step 4 — Location onboarding (20s)

Go back to **SOS**. Point at the **Enable location during setup** card.

Say:

> Geolocation permission is requested during setup, never at the crisis moment. `watchPosition` keeps a high-accuracy fix; denied permission or GPS failure falls back to the last-known position.

You can click **Enable** if the browser prompts. If permission is denied, the demo still works — the alert simply has no initial GPS fix.

### Step 5 — Trigger the silent SOS (1 min)

Tap the dial once, or hold it for 600 ms.

Say while doing it:

> There is deliberately no sound, no modal and no success animation. The only feedback is the dial dimming and the quiet `SOS ACTIVE` state. That is the “silent” requirement.

Expected behaviour:

- `POST /api/alerts/trigger` returns `201` and creates the alert.
- The dial changes to `TRANSMITTING` / `SOS ACTIVE`.
- The location count starts increasing every 12 seconds (if location is enabled).
- The alert id is stored in `localStorage` under `bsafe.activeAlertId`.
- The terminal prints dry-run emails with tracking links.

### Step 6 — Show the backend trigger path (1 min)

Open the terminal. Point at:

```text
POST /api/alerts/trigger 201
[email dry-run] ... link=http://192.168.1.20:3000/track/<token>
```

Say:

> The trigger handler authenticates the cookie, applies a 5-per-minute limit, validates the body with Zod, then the service:
> 1. creates the `alerts` row in `sent`,
> 2. writes a `triggered` activity log,
> 3. stores the first location if one exists,
> 4. creates one `notification_deliveries` row per contact,
> 5. queues the email dispatch in the background so the response is not blocked.

Note that **SMS is intentionally absent** in this build; email is the only outbound channel.

### Step 7 — Contact tracking page (1.5 min)

Paste the printed link into browser window 2.

Show:

- Public `/track/<token>` page — no login.
- Live Leaflet/OpenStreetMap with the latest fix and accuracy circle.
- Alert status, triggered time, last update time.
- **I'm aware — acknowledge** button (only while status is `sent`).
- Google Maps link.

Click **Acknowledge**. Show that the status changes to `ACKNOWLEDGED` and the user's alert reflects it (SSE/polling).

Say:

> The tracking token is an unguessable UUID. The public DTO exposes only the user's name, status, timestamps and last location — never the alert id, contact data or phone numbers. Acknowledgement is only allowed from `sent`.

### Step 8 — Admin dashboard (1.5 min)

In browser window 3, sign in as `admin@bsafe.test` / `Password123!`, then open `/admin`.

Show:

- Total alerts, active in 24h, acknowledgement rate, average time-to-ack and time-to-resolve.
- 30-day alerts-per-day bar chart.
- Cross-user alert table with status, user, timestamps, location count, sent/failed deliveries.
- Status filter.
- **Retry** button appears when a delivery is failed (the seed deliberately has one failed delivery).

Say:

> Every admin route checks `isAdmin` on the server, not just in the UI. `proxy.ts` also blocks non-admins from the `/admin` page. Reports are aggregated in JavaScript because SQLite does not have Postgres' `date_trunc`/`interval`.

### Step 9 — Resolve the alert (30s)

Back in window 1, click **Resolve alert**.

Show:

- User page returns to the idle dial.
- Tracking page shows `RESOLVED` and a notice that live location is no longer shared.
- Location POSTs stop; the API also rejects new locations for a resolved alert with `409`.

Say:

> The activity log is append-only: `triggered`, `acknowledged`, `resolved`. The public link stops updating, but it does not have a time-based expiry in this build — that would be a production addition.

### Step 10 — Show the database (1 min)

Run `npm run db:studio` in another terminal. Show these tables:

| Table | What to point out |
| --- | --- |
| `users` | bcrypt `password_hash`, optional phone, `is_admin` |
| `emergency_contacts` | `user_id` FK, unique `(user_id, phone)` / `(user_id, email)` |
| `alerts` | status, `tracking_token`, `triggered_at`, `resolved_at`, `last_location_id` |
| `alert_locations` | full time-series, not just one point |
| `activity_logs` | audit trail of every transition |
| `notification_deliveries` | per-contact email status, attempts, `last_error`, `sent_at` |

Say:

> `alerts.last_location_id` is a deliberate read optimisation — the latest fix is one lookup. The complete movement history stays in `alert_locations`.

---

## 3. Backend/API explanation to speak

### Request lifecycle for an authenticated API call

```text
Browser (axios/TanStack Query)
  → Next.js route handler  app/api/...
  → getAuthUser()          verify JWT cookie (jose) + load user (Prisma)
  → rateLimit()            in-memory fixed window per user
  → parseBody()/parseQuery zod validation
  → service layer          lib/server/*.ts
  → Prisma                 SQLite
  → JSON response          { message } on errors
  → optional publish()     SSE signal to connected clients
```

### Key backend files

| File | Role |
| --- | --- |
| `proxy.ts` | Next 16 request proxy (formerly middleware): protects pages, redirects anonymous users, blocks non-admins from `/admin` |
| `lib/server/auth.ts` | Cookie session helpers, `getAuthUser`, DTO mapping, admin allowlist |
| `lib/server/jwt.ts` | HS256 JWT creation/verification, 7-day cookie options |
| `lib/server/alerts.ts` | Trigger, location append, status transitions, ownership |
| `lib/server/contacts.ts` | Max-5 cap, duplicate checks, cache invalidation |
| `lib/server/tracking.ts` | Public token lookup and acknowledgement |
| `lib/server/notifications.ts` | Delivery rows, retries, status DTOs |
| `lib/server/email.ts` | Nodemailer or dry-run logging |
| `lib/server/admin.ts` | Cross-user table + SQLite-compatible KPIs |
| `lib/server/rate-limit.ts` | Fixed-window limiter keyed by user or IP |
| `lib/server/cache.ts` | TTL cache with explicit invalidation |
| `lib/server/events.ts` | In-process SSE pub/sub |
| `lib/server/sse.ts` | `text/event-stream` response helper |

### Error conventions

| Status | Meaning in this app |
| --- | --- |
| 400 | Zod validation failed, max contacts reached, illegal status transition |
| 401 | Missing/invalid session |
| 403 | Authenticated but not admin |
| 404 | Alert/contact/tracking token not found (also hides other users' resources) |
| 409 | Duplicate contact/account, location on a resolved alert |
| 429 | Per-route rate limit exceeded |

---

## 4. Frontend explanation to speak

| Topic | Explanation |
| --- | --- |
| App Router | Pages live in `app/`; `app/(app)/` is a protected route group with the sidebar shell. `/login` and `/track/[token]` sit outside it. |
| Server vs client components | Layouts/pages are server components; interactive screens use `"use client"`. `AppShell` guards the session on the client while `proxy.ts` guards it on the server. |
| Data fetching | TanStack Query + axios. Mutations invalidate `['contacts']`, `['profile']`, admin queries. |
| Auth state | `AuthProvider` calls `GET /api/auth/me` once and exposes `user`, `signIn`, `signUp`, `signOut`. |
| SOS screen | `SosPanel` reads the active alert id from `localStorage`, polls every 15s, and subscribes to SSE for faster updates. |
| Location loop | `useGeolocation` uses `watchPosition`; `SosPanel` POSTs a fix every 12s and on tab backgrounding. |
| Silent UX | `SosButton` supports tap and 600ms long-press. Feedback is only a dimmed dial — no sound/modal. |
| Tracking page | Client page uses `useParams`, polls every 12s, subscribes to the public SSE stream, and loads Leaflet with `next/dynamic({ ssr: false })` because Leaflet needs `window`. |
| Admin page | `AppShell` redirects non-admins; the API independently returns `403`, so UI hiding is not the only protection. |

---

## 5. Optional edge-case demos (if time permits)

| Demo | How | Expected |
| --- | --- | --- |
| Anonymous protection | Open `/` in a private window | `307` redirect to `/login?next=/` |
| Admin protection | Sign in as Priya and open `/admin` | Redirect to `/`; direct API call returns `403` |
| Validation | Add a contact with phone `123` | `400` with a message |
| Duplicate contact | Reuse a seeded phone/email | `409` |
| Rate limit | Trigger more than 5 alerts in a minute | `429` with `Retry-After` |
| Resolved alert | POST a location after resolving | `409` |
| Public token privacy | Inspect `/api/tracking/<token>` response | No alert id/contact/phone fields |

---

## 6. Troubleshooting during the demo

| Problem | Fix |
| --- | --- |
| Port 3000 busy | Stop the old process, then `npm run dev` |
| Login fails | Run `npm run db:reset`; seeded password is `Password123!` |
| No tracking link in terminal | Scroll up, or run `npm run db:studio` and copy `alerts.tracking_token` |
| Map tiles blank | Network may block OpenStreetMap; the status/timestamps still demo the flow |
| Geolocation denied | Continue — the trigger works without a fix; mention the fallback |
| Admin table empty | You are signed in as a non-admin; use `admin@bsafe.test` |
| Prisma client error after reset | Stop `npm run dev`, run `npm run db:reset`, restart |
| Dry-run email sends nothing | Expected: `EMAIL_DRY_RUN=true`; use the printed link |

---

## 7. What not to claim

- Do **not** say this is connected to police/emergency services.
- Do **not** claim SMS is implemented — it is intentionally out of scope.
- Do **not** claim Redis/BullMQ/persistent queue — the queue/rate-limit/cache/SSE are in-process.
- Do **not** claim the public tracking link has a time-based expiry — it stops updating on resolve only.
- Do **not** claim the trigger flow is fully transactional — see the viva guide's honest limitation section.
