# bSafe Next.js — API contract

All routes live under `/api` in the Next.js App Router. Responses are JSON; errors use
`{ "message": string | string[] }` with the original status codes. Authentication is a
signed HttpOnly cookie (`bsafe_session`), not Firebase.

## Auth (`/api/auth`)

| Method | Route | Auth | Rate limit | Body / response |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/signup` | – | 10/min per IP | `{name,email,password}` → `UserDto`, sets cookie (201) |
| POST | `/api/auth/signin` | – | 10/min per IP | `{email,password}` → `UserDto`, sets cookie |
| POST | `/api/auth/signout` | – | 30/min per IP | clears cookie → `{ok:true}` |
| GET | `/api/auth/me` | ✅ | 30/min | `UserDto` or 401 |
| POST | `/api/auth/sync` | ✅ | 10/min | no-op compatibility route → `UserDto` |

`ADMIN_EMAILS` (comma-separated) promotes matching accounts to `isAdmin` on signup/signin.

## Users (`/api/users`)

| Method | Route | Auth | Rate limit | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/users/me` | ✅ | 30/min | profile (cached 60s) |
| PATCH | `/api/users/me` | ✅ | 10/min | `{name?,phone?}` |

## Contacts (`/api/contacts`)

| Method | Route | Auth | Rate limit | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/contacts` | ✅ | 30/min | cached 30s |
| POST | `/api/contacts` | ✅ | 10/min | max 5, `email` required, duplicate phone/email → 409, 201 |
| PATCH | `/api/contacts/:id` | ✅ | 10/min | owner-scoped |
| DELETE | `/api/contacts/:id` | ✅ | 10/min | 204 |

## Alerts (`/api/alerts`)

| Method | Route | Auth | Rate limit | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/alerts/trigger` | ✅ | 5/min | creates alert + deliveries, 201 |
| POST | `/api/alerts/:id/location` | ✅ | 60/min | 201 location |
| PATCH | `/api/alerts/:id/status` | ✅ | 20/min | `{status:'acknowledged'|'resolved'}` |
| GET | `/api/alerts/:id` | ✅ | 30/min | `AlertDto` |
| GET | `/api/alerts` | ✅ | 30/min | `AlertDto[]` newest first |
| GET | `/api/alerts/:id/stream` | ✅ | 60/min | SSE `event: update` (`{reason,at}`) |

## Public tracking (`/api/tracking`)

| Method | Route | Auth | Rate limit | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/tracking/:token` | token | 20/min/IP | `AlertTrackingDto`; 404 invalid token |
| POST | `/api/tracking/:token/acknowledge` | token | 10/min/IP | only while `sent` |
| GET | `/api/tracking/:token/stream` | token | 60/min/IP | SSE `event: update` |

## Notifications (`/api/notifications`)

| Method | Route | Auth | Rate limit | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/notifications/:alertId/status` | owner | 30/min | `NotificationDeliveryDto[]` |
| POST | `/api/notifications/:alertId/retry` | admin | 5/min | requeue failed → `{requeued}` (202) |

Email only — SMS is intentionally not implemented. `EMAIL_DRY_RUN=true` logs the message and
marks the delivery `sent`; when false, Nodemailer uses the `SMTP_*` env vars. Retries use
3 attempts with exponential backoff and persist `failed` + `lastError` after exhaustion.

## Admin (`/api/admin`)

| Method | Route | Auth | Rate limit | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/alerts` | admin | 30/min | filters `status,from,to,userId,take,skip` |
| GET | `/api/admin/reports` | admin | 10/min | aggregate KPIs |

## Health

`GET /api/health` → `{status:'ok', database:'connected', auth:'cookie'}`.

## Realtime

Next.js route handlers do not expose a WebSocket endpoint, so the original Socket.IO stream is
replaced by Server-Sent Events. The client still sends location fixes over REST every 12s; the
SSE channel only signals that canonical data changed, and clients refetch.
