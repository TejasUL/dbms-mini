# Product Requirements Document — bSafe (Next.js build)

**Silent SOS Emergency Web App**
Re-implementation of the original bSafe project as a single Next.js end-to-end application.

---

## 1. Overview

bSafe is a web-based personal safety platform that lets a user send an instant,
non-verbal emergency alert with a single action. It is built for situations where
calling or speaking is unsafe or impossible — the alert discreetly notifies
pre-configured trusted contacts along with the user's live location, and tracks
the alert until it is resolved.

> Demo/portfolio build. Not connected to emergency services.

## 2. Problem statement

In emergencies such as harassment, stalking, domestic abuse, medical distress or
public-safety threats, victims may be unable to call, speaking may escalate
danger, panic makes it hard to explain a location, and response time is delayed.
Existing emergency systems depend heavily on verbal communication.

## 3. Objectives

**Primary**

- One-click / long-press silent emergency alerts.
- Real-time location sharing with trusted contacts.
- Reduce response time in critical situations.

**Secondary**

- Discreet alternative to emergency calls.
- Trusted-contact safety networks.
- Reliable emergency data for responders.
- A codebase that can be deployed for campuses/cities.

## 4. Scope

**In scope**

- Web-based emergency alert system.
- One-click / long-press SOS trigger.
- Real-time location history and tracking.
- Email notifications to contacts (SMS intentionally excluded from this build).
- Alert status tracking: `sent → acknowledged → resolved`.
- Public tokenized tracking page.
- Admin/monitoring dashboard.
- In-process cache and per-route rate limits.

**Out of scope**

- Native mobile applications.
- Automated police/911 integration.
- AI-based threat detection.
- SMS delivery (explicitly removed in this re-implementation).
- Automated test suites (manual verification, matching the original scope).

## 5. Functional requirements

| Area | Requirement |
| --- | --- |
| Silent SOS | Tap or 600ms long-press; no sound, modal or success animation |
| Live location | Browser geolocation; 12s updates while alert active; last-known fallback |
| Emergency contacts | Max 5 trusted contacts; phone + email required |
| Notifications | Email only, queued in-process with retry/failure tracking |
| Alert tracking | `sent`, `acknowledged`, `resolved`; timestamped activity log |
| Public tracking | Unguessable token; view-only; stops updating when resolved |
| Admin | Cross-user alert table, KPIs, filters, delivery retry |
| Auth | Email/password, signed HttpOnly cookie, route protection |

## 6. Non-functional requirements

- Alert dispatch target: **< 2 seconds** from trigger to delivery rows created.
- Secure handling: HttpOnly cookie, bcrypt password hashes, tokenized public links.
- Mobile-responsive UI.
- Rate-limited API surface (per route, per user where authenticated).
- Graceful geolocation fallbacks (permission denied, GPS unavailable).
- Single-process demo: in-memory cache/rate limits/SSE channels reset on restart.

## 7. Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4 |
| Data fetching | TanStack Query, axios |
| Maps | Leaflet + OpenStreetMap |
| Backend | Next.js route handlers, Zod, bcryptjs, jose |
| Database | SQLite via Prisma 6 |
| Realtime | Server-Sent Events (SSE) |
| Notifications | Nodemailer or dry-run console logging |
| Dev runner | nodemon → `next dev` |

## 8. User flow

1. User creates an account and adds emergency contacts.
2. User enables location during onboarding (not at the crisis moment).
3. User triggers the silent SOS (tap or long-press).
4. Alert is created; every contact gets a tokenized tracking link by email.
5. Location fixes stream to the server and to the tracking page.
6. Contacts open the link, see the live map, and acknowledge.
7. The user resolves the alert; the public link shows the final state.

## 9. Data model

- **users** — email/password account, optional phone, admin flag.
- **emergency_contacts** — up to 5 trusted contacts per user.
- **alerts** — one row per SOS trigger; status, timestamps, tracking token.
- **alert_locations** — time-series of GPS fixes per alert.
- **activity_logs** — audit trail of trigger/acknowledge/resolve transitions.
- **notification_deliveries** — per-contact email delivery status/attempts.

## 10. API and rate limiting

All API routes live under `/api` and enforce their own limits. The SOS trigger is
deliberately permissive (5/min per user); public tracking routes are limited per
IP. Full table: [`docs/API_CONTRACT.md`](API_CONTRACT.md).

## 11. KPIs

- Average trigger → contact notification time.
- Successful alerts sent.
- Acknowledgement rate and time-to-acknowledge.
- Time-to-resolve.
- System uptime.

## 12. Assumptions and constraints

- Contacts are configured before an emergency.
- Internet and location services are available at trigger time.
- Web-only; browser GPS accuracy and background-tab throttling apply.
- Email is the only outbound channel in this build.
- No automated tests; acceptance is verified manually.

## 13. Deliverables

- Fully functional Next.js web app (UI + API).
- SQLite/Prisma data layer with seed data.
- Admin/monitoring dashboard.
- API/UI documentation and this PRD.
- Local setup runnable with one `npm run dev` command.

## 14. Future enhancements

- Native mobile app.
- Optional SMS/offline fallback.
- Police/emergency-service integration.
- Wearable support.
- AI-based risk detection.
- Redis/BullMQ and horizontal scaling for production.
