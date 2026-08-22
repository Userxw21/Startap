# Courier Platform — Monorepo

Backend (auth, DB schema, multi-tenant isolation, Orders/Couriers/Devices)
plus a fleet management dashboard. See the architecture discussion in this
project's history for the full system design; this README covers only how
to actually run what's been built so far.

## Layout

```
apps/
  backend/     NestJS API — auth, DB schema, multi-tenant isolation, Orders/Couriers/Devices,
               realtime WebSocket gateway (src/realtime/)
  dashboard/   Next.js fleet management dashboard (uz/ru/en)
  mobile/      Expo/React Native courier app (uz/ru/en) — auth + profile only so far, see "Mobile app" below
packages/
  shared-types/ API-contract types (Order, Courier, AnalyticsSummary, etc.) used by
                 both apps — see "Shared types" below
docker/
  init-db.sql  creates the restricted DB role RLS depends on
docker-compose.yml   Postgres+PostGIS and Redis for local dev
```

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker Desktop (for Postgres/PostGIS + Redis) — **or**, if Docker/WSL2
  isn't available (e.g. it failed to initialize on Windows 10 in this repo's
  own dev history), install natively instead: PostgreSQL 16 + the
  [PostGIS Windows bundle](https://postgis.net/windows_downloads/) for
  Postgres, and [Memurai](https://www.memurai.com/) (Redis-protocol
  compatible) for Redis. Both run as normal Windows services on the default
  ports (5432, 6379) and need no further config beyond running
  `docker/init-db.sql` by hand against the `courier_platform` database
  (`psql -U courier -d courier_platform -f docker/init-db.sql`) after
  creating the `courier` role/database and `CREATE EXTENSION postgis`
  yourself, since there's no container entrypoint to do it automatically.
- **For the mobile app specifically**: a phone with the Expo Go app, or
  Android Studio (emulator) / Xcode (iOS Simulator, macOS only) — none of
  this was available while `apps/mobile` was built, so it's untested on an
  actual device/emulator so far. See "Mobile app" below.

## First-time setup

```bash
pnpm install
docker compose up -d
cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env` and set real values for `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` (e.g. `openssl rand -base64 48`). The DB values in
`.env.example` already match `docker-compose.yml` for local dev.

Run migrations (creates all tables, PostGIS extension, and the RLS policies):

```bash
pnpm --filter @courier/backend run migration:run
```

Start the API:

```bash
pnpm dev:backend
```

The API listens on `http://localhost:3000/api/v1`.

## Shared types

`packages/shared-types` holds the API-contract types (`Order`, `Courier`,
`Company`, `Device`, `AnalyticsSummary`, the status/role unions, etc.) that
both apps import — `@courier/backend`'s `OrdersService`/`AnalyticsService`
return these shapes directly, and `apps/dashboard/src/lib/types.ts` just
re-exports them instead of hand-duplicating.

Unlike the apps, this package ships **compiled output** (`dist/`, via
`tsc`), not raw `.ts` — deliberately, so it behaves like any normal
`node_modules` dependency for both a NestJS backend (plain `tsc`/Node at
runtime, no bundler magic needed) and a Next.js app, instead of relying on
either toolchain being configured to transpile a workspace package's raw
TypeScript source, which isn't a given without extra config on the NestJS
side. `pnpm dev:backend` and `pnpm --filter @courier/dashboard run dev`
both rebuild it automatically first (`predev`/`prebuild` hooks in each
app's `package.json`) — you shouldn't need to build it by hand, but if
either app ever complains it can't find `@courier/shared-types`, that's the
first thing to check: `pnpm --filter @courier/shared-types run build`.

## API surface so far

```
POST   /api/v1/auth/register-company     public
POST   /api/v1/auth/login                public
POST   /api/v1/auth/refresh              public
POST   /api/v1/auth/logout               public
GET    /api/v1/auth/me                   any authenticated role (used by the dashboard to know who's logged in)

GET    /api/v1/companies/me              any authenticated role

GET    /api/v1/users                     COMPANY_ADMIN, DISPATCHER

POST   /api/v1/invites                   COMPANY_ADMIN (role: DISPATCHER or COURIER), DISPATCHER (role: COURIER only)
GET    /api/v1/invites                   COMPANY_ADMIN, DISPATCHER
POST   /api/v1/invites/:id/revoke        COMPANY_ADMIN, DISPATCHER
GET    /api/v1/invites/preview/:token    public  (email/role/company name, before the invitee sets a password)
POST   /api/v1/invites/accept            public  { token, password } — creates the account, logs in immediately

GET    /api/v1/couriers                  COMPANY_ADMIN, DISPATCHER
GET    /api/v1/couriers/me               COURIER
PATCH  /api/v1/couriers/me/status        COURIER  (OFFLINE/ONLINE/AVAILABLE/PAUSED — not DELIVERING, that's system-set)
POST   /api/v1/couriers/me/location      COURIER  { lat, lng, speedMps?, headingDegrees? } — REST fallback for the WS path, see below

POST   /api/v1/devices                   COMPANY_ADMIN, DISPATCHER
GET    /api/v1/devices                   COMPANY_ADMIN, DISPATCHER
POST   /api/v1/devices/:id/pair          COMPANY_ADMIN, DISPATCHER  (returns the pairing token ONCE, in plaintext)
POST   /api/v1/devices/:id/revoke        COMPANY_ADMIN, DISPATCHER

POST   /api/v1/orders                    COMPANY_ADMIN, DISPATCHER
GET    /api/v1/orders                    COMPANY_ADMIN, DISPATCHER (all), COURIER (own assigned orders only)
GET    /api/v1/orders/:id                same as above, role-checked per order
POST   /api/v1/orders/:id/assign         COMPANY_ADMIN, DISPATCHER  { courierId }
POST   /api/v1/orders/:id/transition     role depends on the transition; see OrdersService's transitions table
                                          { toStatus: ACCEPTED|PICKUP|PICKED_UP|DELIVERING|DELIVERED|CANCELLED|FAILED }

GET    /api/v1/analytics/summary         COMPANY_ADMIN, DISPATCHER  ?from=&to= (ISO dates, default: trailing 30 days)
```

Order lifecycle: `CREATED → ASSIGNED → ACCEPTED → PICKUP → PICKED_UP → DELIVERING → DELIVERED`,
with `CANCELLED`/`FAILED` reachable from most non-terminal states. Each transition
is validated server-side against both the order's current status and the
caller's role — see `OrdersService`'s `transitions` table, the single source
of truth for what's allowed (not scattered `if` statements per endpoint).

## Inviting dispatchers and couriers

There's no `POST /users/dispatchers` or `POST /couriers` (onboard) anymore —
an admin creating an account and handing someone their own password was
always flagged as an MVP shortcut, not the real design. Now: `POST /invites`
takes only an email, name, and role (+ vehicle info for a courier) — never
a password — and returns a single-use token valid for 7 days. The invitee
hits `POST /invites/accept` with that token and a password of their own
choosing, which creates the account (`User` + `Courier` + `Vehicle` for a
courier invite) and logs them in immediately.

**There's no email/SMS delivery wired up** — `POST /invites`' response
includes the token in plaintext, and it's on whoever calls that endpoint to
get it to the invitee some other way for now (copy-paste, a Slack message,
whatever). `GET /invites/preview/:token` exists so a real accept-invite
page can show "you're joining {company} as a {role}" before asking for a
password, without needing to be logged in.

The dashboard has both sides of this now: `/invites` (COMPANY_ADMIN/DISPATCHER)
lists sent invites, lets you send a new one, and shows the shareable
`/accept-invite?token=...` link once right after creation (with a copy
button — it's not retrievable again after you navigate away, same as the
API). `/accept-invite` itself is a public page (added to `middleware.ts`'s
exclusion list alongside `/login`) that previews the invite and lets the
invitee set their password.

A dispatcher can invite a courier but not another dispatcher — same
privilege-escalation guard the old direct-creation endpoint had, just moved
here. `test/couriers-devices.e2e-spec.ts` exercises the whole flow,
including rejecting a duplicate pending invite, rejecting accepting the
same invite twice, and confirming the password hash never leaks in any
response.

## Real-time (WebSocket)

`RealtimeGateway` (Socket.IO, at the same host/port as the REST API — no
separate port) authenticates each connection with the same JWT access token
the REST API uses, passed as `{ auth: { token } }` in the Socket.IO client
handshake. On connect, the socket joins a room scoped to the caller's
company (`company:{companyId}`) — that room membership is the entire tenant
boundary on the WS side, same principle as RLS on the DB side: you only ever
receive events for your own company.

Events broadcast to that room:
```
courier:location:update    { companyId, courierId, lat, lng, speedMps, headingDegrees, recordedAt }
courier:status:changed     { companyId, courierId, status }
order:status:changed       { companyId, orderId, status, assignedCourierId }
device:status:changed      { companyId, deviceId, status }
```

`courier:location:update` is also the one *inbound* message a client can
send — a COURIER-role socket emits `courier:location` with `{ lat, lng,
speedMps?, headingDegrees? }`, which updates a Redis-cached "current
position" (90s TTL — a courier who goes quiet just ages out, no explicit
offline write needed), throttles a sample into `location_points` for the
historical trail (at most once per 10s per courier — see
`LocationsService`), and re-broadcasts to the company room. `POST
/couriers/me/location` does the exact same thing over plain REST, for
testing without a WebSocket client.

**To test it**: open `apps/backend/realtime-test.html` directly in a
browser (no build step, just double-click it) — twice, in two tabs. Connect
tab 1 with a COMPANY_ADMIN or DISPATCHER token (it'll just listen). Connect
tab 2 with a COURIER token from the *same* company, and click "Send
location" — tab 1's log should show `courier:location:update` arrive live.
Then, with both tabs still open, trigger an order or courier status change
via `requests.http` and watch it show up in tab 1 without a page refresh.

Redis is used two ways here: as the location cache (above), and — if
reachable at boot — as the Socket.IO adapter so events fan out across
multiple backend instances (`RedisIoAdapter` in `main.ts`). If Redis isn't
running, the adapter connection times out after 5s, logs a warning, and
falls back to Socket.IO's in-memory adapter — a single backend instance
behaves identically either way, so this never blocks local dev.

**The dashboard consumes this too now.** Every dashboard page under
`(dashboard)/` renders an invisible `<RealtimeRefresher />` that subscribes
to all four events and calls `router.refresh()` (debounced ~800ms) whenever
one arrives — so Overview/Couriers/Orders update on their own, no manual
reload, no client-side state to keep in sync by hand (it just re-runs the
same server fetch that rendered the page the first time). The Topbar's
`LiveIndicator` pill shows the socket's own connection state (`Live` /
`Connecting...` / `Offline`) so it's obvious at a glance whether the feature
is actually working.

One deliberate, documented tradeoff to know about: a browser holding a live
WebSocket connection needs a token to hand the backend directly, which
means the access token has to reach client-side JavaScript at least once —
see `apps/dashboard/src/app/api/realtime-token/route.ts` for exactly where
and why, and how it's narrowed (same-origin endpoint gated by the httpOnly
cookie, not a readable cookie itself). This is the one deliberate exception
to "tokens never reach the browser" elsewhere in this app.

**To see it live in the dashboard**: log in, open `/couriers` or `/orders`
in one browser tab, and in a second tool (`requests.http`, or the courier
side of `realtime-test.html`) trigger a status change or send a location
update for that same company — the dashboard tab should update within
about a second, no reload.

## Live map (dashboard)

`/map` shows courier positions on a real map, live. Chose **Google Maps
Platform** over Yandex Maps here (the originally planned provider) after
researching both:

- Yandex's free tier explicitly **forbids** "transport tracking" and "closed
  systems" (anything behind a login) — exactly what this app is, in both
  respects. Real usage requires their paid Commercial license, priced in
  rubles, with no transparent self-serve signup (contact-sales only).
- Google Maps Platform has no such restriction, a transparent self-serve
  pricing calculator, and a free Maps SDK tier generous enough for a pilot.
  Confirmed Uzbekistan/Tashkent routing coverage is solid for both providers.

**Setup**: get an API key at
[console.cloud.google.com/google/maps-apis](https://console.cloud.google.com/google/maps-apis)
(enable "Maps JavaScript API"), then set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
in `apps/dashboard/.env`. Left unset, `/map` shows a plain "not configured"
placeholder instead of a broken page or console errors — confirmed by
testing without a key before one was available.

**How it stays live**: courier markers are seeded from each courier's last
cached position (`GET /couriers`'s new `lastLocation` field, sourced from
`LocationCacheService` — the same Redis cache the realtime pipeline already
maintains) and then updated in place as `courier:location:update` WebSocket
events arrive, via `components/MapView.tsx`'s own `useRealtimeEvent`
subscription. Deliberately does **not** use `<RealtimeRefresher />` (the
`router.refresh()` pattern every other page uses) — that would re-fetch and
re-render the whole page on every location ping, resetting marker positions
and fighting the map's own pan/zoom state instead of animating smoothly.
New couriers only appear on next navigation to the page — an accepted v1
scope limit, not solved yet.

## Analytics

`GET /analytics/summary` (and the dashboard's `/analytics` page) computes,
per company, over a date range (default: trailing 30 days):

- Order counts by status
- Average delivery time (`ACCEPTED → DELIVERED`, from `order_status_history`)
- Average dispatch time (`CREATED → ASSIGNED`)
- Average delivery distance
- A top-couriers leaderboard by delivered count

One number on that page is a deliberate approximation, not a bug: **average
delivery distance is straight-line (great-circle, via PostGIS `ST_Distance`
between pickup and delivery coordinates), not actual route distance.** There's
no routing data yet — `routes.distanceMeters` only gets populated once
Yandex (or another routing provider) is wired up in Phase 5, which is
blocked on API access, not code. Swap the query in `AnalyticsService` for an
average of `routes.distanceMeters` once that data exists; until then, this
number will systematically undercount real distance (straight lines are
always shorter than the roads couriers actually ride).

The rest of the original architecture's analytics wishlist (route
deviations, ETA accuracy, device uptime/battery, courier utilization %) isn't
here — each needs data this system doesn't collect yet (route/navigation
sessions, device heartbeats, courier status history), not just a missing
query. Building the query without the underlying data would just be a
convincing-looking number with nothing real behind it.

## Trying it out

**If you're using VS Code**: install the "REST Client" extension (by Huachao
Mao), then open `apps/backend/requests.http` and click "Send Request" above
each block, top to bottom — it walks through the entire flow (register →
onboard a courier → pair a device → create and run an order through its full
lifecycle) with tokens and ids captured and reused automatically, no need to
copy-paste anything between requests.

Otherwise, the same flow with curl:

```bash
# Register a company + its first admin
curl -X POST http://localhost:3000/api/v1/auth/register-company \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Acme Delivery","adminEmail":"admin@acme.test","adminFullName":"Admin User","password":"a-strong-password-123"}'

# Log in
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.test","password":"a-strong-password-123"}'

# Use the accessToken from the login response
curl http://localhost:3000/api/v1/companies/me \
  -H "Authorization: Bearer <accessToken>"
```

## Running the dashboard

Needs the backend running first (see above). Then, in a second terminal:

```bash
cp apps/dashboard/.env.example apps/dashboard/.env
pnpm install
pnpm --filter @courier/dashboard run dev
```

Open http://localhost:3001 (Next.js picks 3001 automatically since the
backend already has 3000). Log in with whatever company admin you registered
earlier via `/auth/register-company`.

**Note on tokens**: the dashboard never exposes the access/refresh tokens to
browser JavaScript — login and the auth middleware set them as `httpOnly`
cookies server-side, and every backend call happens from Server
Components/Actions, not the browser. Nothing to configure for this, just
worth knowing if you're wondering why `document.cookie` won't show them in
devtools — that's the point, not a bug.

**Note on COURIER-role accounts**: a courier who logs into the dashboard
(rather than the mobile app — see below) sees a one-screen "this isn't for
you" notice instead of the normal Sidebar/Overview — every dashboard page
calls COMPANY_ADMIN/DISPATCHER-only backend endpoints, so there was nothing
useful to show them anyway. See `CourierNotice` and the role check at the
top of `(dashboard)/layout.tsx`.

## Mobile app

`apps/mobile` — Expo/React Native, for couriers only (company
admins/dispatchers use the dashboard). **Phase 1 scope**: login, session
persistence, and a placeholder "logged in as X, status Y" screen backed by a
real `GET /couriers/me` call. No order list, no location sending, no
navigation UI yet — those are later phases.

**React Native over native (Kotlin Multiplatform + Swift), reversing an
earlier decision**: the original plan was native-only because Yandex Maps
had no official React Native/Flutter SDK. Since switching to Google Maps
Platform (see "Live map" above), that constraint is gone — Google publishes
official `@googlemaps/react-native-navigation-sdk` (Beta, but backed by the
`googlemaps` GitHub org, 224+ stars). One codebase instead of two native UI
layers is a meaningful speed advantage for a small team, and BLE for the
hardware nav device (a later phase) has mature RN support
(`react-native-ble-plx`) either way, so it wasn't a deciding factor.

**No Android/iOS emulator or device in this dev environment** (see
Prerequisites), so verification took two tracks:
- `pnpm --filter @courier/mobile run typecheck` / `run lint` — clean.
- `npx expo export --platform android` — a real Metro bundle (822 modules,
  producing an actual `.hbc` JS bundle), not just a type-check. Caught a
  real bug: `metro.config.js`'s monorepo setup initially had
  `disableHierarchicalLookup: true` (from a commonly-copied Expo-monorepo
  guide), which broke resolution of `@react-navigation/core` — a transitive
  dependency of `@react-navigation/native` living in pnpm's nested
  node_modules. Removed; documented in `metro.config.js` itself.
- **`expo start --web`, actually clicked through in a real browser** —
  temporarily added `react-native-web`/`react-dom` for this (not a real
  target platform; couriers use Android/iOS, this was purely to get a
  click-testable surface without a device). Full login → home → logout →
  session-persists-across-reload cycle confirmed working against the real
  backend. Caught a real bug this way: `expo-secure-store` has no working
  web implementation (throws `getValueWithKeyAsync is not a function`, not
  a graceful no-op) — fixed by branching `src/lib/auth-storage.ts` on
  `Platform.OS === 'web'` to use `localStorage` there instead (the real
  Android/iOS targets are unaffected, they still use SecureStore).
  **`react-native-web`/`react-dom` were removed again afterward** — they
  pulled in React 19, conflicting with the dashboard's React 18 in this
  pnpm workspace and breaking `next build` with a cryptic
  `ReactCurrentDispatcher` error. The `Platform.OS === 'web'` branch in
  `auth-storage.ts` stays (harmless, unreachable without react-native-web),
  documented as a lesson: verify with a throwaway platform, then remove it
  before it becomes a standing cross-package dependency conflict.

This is real click-through verification of the auth flow — closer to what
was done for the dashboard than a typecheck-only pass — but still doesn't
prove the *native* Android/iOS builds work (native modules, platform-
specific navigation chrome, and permissions prompts don't exist in the web
build). That needs your own phone (via `expo start` + the Expo Go app, or
a dev build for native modules Expo Go doesn't include) or Android
Studio's emulator. Not done yet.

**Auth model differs from the dashboard's**: no `httpOnly` cookies exist on
mobile (that's a browser mechanism), so tokens live in `expo-secure-store`
(OS-level encrypted storage — Android Keystore / iOS Keychain), and
`src/lib/api.ts` handles the refresh-on-401 dance itself (the dashboard
relies on `middleware.ts` for that server-side). See that file's comments
for how it differs from `apps/dashboard/src/lib/api.ts`.

**Setup** (once you have a way to run it):
```bash
cp apps/mobile/.env.example apps/mobile/.env
pnpm install
pnpm --filter @courier/mobile run start
```
For a physical device or the Android emulator, `localhost` in
`EXPO_PUBLIC_BACKEND_API_URL` won't reach your dev machine — see the
comment in `.env.example` for the fix (LAN IP, or `10.0.2.2` for the
Android emulator specifically).

## Forgot password (SMS) — courier-only

Couriers can reset a forgotten password from the mobile app via an SMS
code: `POST /auth/forgot-password` (phone) → SMS with a 6-digit code →
`POST /auth/reset-password` (phone, code, new password). Not offered on the
dashboard — company admins/dispatchers don't provide a phone number and
weren't in scope for this.

**Why a phone is now required for courier accounts**: it didn't exist as a
collected field before this. `AcceptInviteDto.phone` is required (validated
as `998XXXXXXXXX`) specifically when accepting a **courier** invite —
dispatcher invites still don't need one. The dashboard's accept-invite page
only shows the phone field when the invite's role is COURIER.

**SMS provider: Eskiz.uz**, chosen after comparing options for Uzbekistan —
~95 UZS/SMS, self-serve signup with local payment methods (Payme/Click/
Uzum), versus international providers that don't reliably or cheaply reach
Uzbek numbers. **Signup is not done by this code** — create an account at
eskiz.uz yourself (this assistant can't create accounts or enter payment
details), then set `ESKIZ_EMAIL`/`ESKIZ_PASSWORD` in `apps/backend/.env`.
Left unset, `apps/backend/src/sms/sms.service.ts`'s `ConsoleSmsSender`
logs the code to the server console instead of texting it — good enough to
develop and test the whole flow (confirmed by hand: request code, read it
from the log, reset the password, log in with the new one) without a real
SMS account.

**Security notes**:
- Codes are 6 digits, Redis-backed with a 5-minute TTL, hashed before
  storage (`OtpService`) — same "don't store the literal secret" reasoning
  as refresh tokens. A 60-second per-phone cooldown between SMS sends and
  a 3-requests/15-minutes-per-IP throttle on `/auth/forgot-password` guard
  against SMS-cost abuse (each successful request costs real money).
- `/auth/forgot-password` and `/auth/reset-password` return the same
  response shape regardless of whether the phone matches an account (or,
  for reset, whether the code is right) — same "don't reveal whether an
  account exists" posture `login()` already has, just for phone numbers.
- A successful reset revokes every existing refresh token for that
  account, forcing re-login on every device — the same posture already
  taken for detected refresh-token theft in `AuthService.refresh()`.
- **Found and fixed a real bug via manual testing**: `OtpService.verify()`
  originally deleted the stored code on *any* verification attempt,
  including a wrong one — meaning a single mistyped digit silently
  invalidated the correct code, forcing a whole new SMS. Fixed to only
  delete on an actual match; brute-force protection is `/auth/reset-
  password`'s own throttle (5 attempts/15min/IP), not code-deletion.

## Running tests

Unit tests (no DB needed):

```bash
pnpm --filter @courier/backend run test
```

e2e tests (needs the docker-compose Postgres running, with `docker/init-db.sql`
applied — that happens automatically the first time the Postgres container's
volume is created; if you already had the volume from before this role was
added, run `docker compose down -v && docker compose up -d` once to recreate
it, and re-run migrations):

```bash
pnpm --filter @courier/backend run test:e2e
```

`test/rls.e2e-spec.ts` is the one worth reading first — it directly proves
that Postgres itself, not just application code, refuses to return another
tenant's rows, by querying with no `WHERE companyId = ...` clause at all and
confirming the database still filters correctly.

## Continuous Integration

`.github/workflows/ci.yml` runs on every push/PR: a fresh Ubuntu runner,
real Postgres+PostGIS and Redis service containers, migrations, the full
backend build, unit tests, e2e tests, and a dashboard build/type-check.
**Status: green** — pushed, ran, failed four times on real (mechanical, not
architectural) bugs, all fixed; see "What CI has actually verified" above
for exactly what that does and doesn't prove.

Still true and worth knowing:
- **No `pnpm-lock.yaml` is committed yet** — the workflow uses plain
  `pnpm install` instead of `--frozen-lockfile`, and skips `setup-node`'s
  pnpm cache (which requires a lockfile to hash). Commit the lockfile the
  first time someone runs `pnpm install` for real, then switch both jobs to
  `--frozen-lockfile` and re-enable the cache for faster, reproducible runs.
- The dashboard job builds/type-checks but never starts a live backend
  (every page reads `cookies()`, so nothing pre-renders at build time) —
  it can't prove a real login-and-click-through works. Still a manual (or
  future Playwright) step.

## What's deliberately not here yet

- Route/Navigation integration (Orders exist and move through their full
  status lifecycle, but nothing calls Yandex's routing API yet or populates
  the `routes`/`navigation_sessions` tables — that's Phase 5)
- A live map (the dashboard now updates its tables/stats live — see "Real-time
  (WebSocket)" above — but there's no map component yet showing courier dots
  moving on a map; that needs a map-tiles provider, which is tangled up with
  the still-open Yandex Maps procurement question from the original
  architecture, so it's deliberately not started)
- The mobile apps (Android/iOS)
- Actual email/SMS delivery for invites — the dashboard's `/invites` page
  (COMPANY_ADMIN/DISPATCHER) sends invites and shows the resulting
  `/accept-invite?token=...` link once, with a copy button, but getting that
  link to the invitee is still "copy it and send it yourself" (Slack, WhatsApp,
  whatever) — no email/SMS provider is wired up.

## ✅ What CI has actually verified (as of the first green run)

Everything below was written with no Node.js/Docker available to execute it —
this whole section used to be a list of "reasoned carefully, not run" risks.
Once pushed, CI (real Postgres+PostGIS, real Redis, real `pnpm install`)
caught four genuine bugs on the way to green, all fixed in the commit
history: a TypeScript enum/union mismatch at the `@courier/shared-types`
boundary in `OrdersService`, a TypeORM CLI module-loading issue
(`typeorm-ts-node-commonjs` vs. a manual `ts-node` wrapper), eight entity
columns missing an explicit `type:` (TypeScript can't reflect a `string |
null` union to a SQL type, so TypeORM needs to be told), and a couple of
test-file mistakes (`supertest`'s default vs. namespace import, test
fixture data violating the app's own validation rules). None of those were
architecture problems — all mechanical, all now fixed.

**Now actually confirmed, not just reasoned about:**
- `OrdersService`'s raw `ST_MakePoint`/`ST_X`/`ST_Y` SQL — `test/orders.e2e-spec.ts`
  round-trips real coordinates through a real PostGIS instance and asserts
  they come back unchanged. Passes.
- The RLS backstop — `test/rls.e2e-spec.ts` passes, meaning Postgres itself
  (not just application code) actually refuses cross-tenant rows.
- Migrations, entity schema, and the `courier_app` restricted-role RLS setup
  (`docker/init-db.sql`) all run cleanly against a fresh database.
- Auth flow, courier onboarding, device pairing, and the full order lifecycle
  (assign → accept → pickup → picked up → delivering → delivered, with the
  courier-status side effects) — `auth.e2e-spec.ts` and
  `couriers-devices.e2e-spec.ts` pass end to end.
- `packages/shared-types` actually resolves correctly from both apps via
  pnpm workspaces + the `predev`/`prebuild` build hooks — no module
  resolution issues.
- The dashboard **builds and type-checks** cleanly (`next build`, which also
  compiles `middleware.ts`) — this is real signal, not a guess, but it's
  still not the same as a human clicking through it in a browser (see below).
- `RealtimeGateway`'s JWT handshake auth, company-room scoping, and the
  `courier:location` → `courier:location:update` round trip —
  `test/realtime.e2e-spec.ts` connects real `socket.io-client` sockets
  against the app on a real port, confirms a missing/garbage token gets
  disconnected, a valid one joins the right room, an emitted location
  update reaches another socket in the same company, and — the one that
  actually matters most — a *different* company's socket never receives it.
- `AnalyticsService`'s `ST_Distance` query and the `order_status_history`
  CTE joins — `test/analytics.e2e-spec.ts` runs an order through to
  DELIVERED and confirms the summary reflects real counts, a non-zero
  `avgDeliveryTimeSeconds`, and a non-zero `avgDeliveryDistanceMeters`
  (proving the PostGIS distance query actually returns something,
  not just that it doesn't error).

**Verified locally, end-to-end, in a real browser (no Docker — see below):**
- Full golden path: register company (API) → dashboard login → live
  overview page (real-time indicator connected via the actual Redis-backed
  Socket.IO adapter, not the in-memory test one) → create a courier invite
  (with vehicle type) → the public `/accept-invite` page correctly previews
  the company name and role → set a password → account created and
  auto-logged-in → graceful role-aware redirect ("this dashboard isn't for
  couriers") → the new courier shows up correctly, tenant-scoped, in the
  admin's courier list, with no `passwordHash` leaked.
- This run found and fixed one real bug that `next build` had not caught:
  `useTranslations` in a `'use client'` page still needs next-intl's
  request-config file (`src/i18n/request.ts` + `next-intl/plugin` in
  `next.config.js`) because Next.js server-renders client components too.
  See `apps/dashboard/src/i18n/request.ts` and `next.config.js`.

- Orders end-to-end: dashboard-assign an order, transition it through the
  full lifecycle (ACCEPTED → PICKUP → PICKED_UP → DELIVERING → DELIVERED)
  as the courier, and see Analytics correctly reflect it — including a real
  `ST_Distance` result (3.1km between two real Tashkent coordinates), not
  just a non-null number.
- Devices: register → pair (courier's `currentDeviceId` updates) → revoke
  (clears back to null) — full lifecycle via the API (no dashboard UI for
  this yet).
- **Multi-tenant RLS with a second real company**: a second company's admin
  gets an empty couriers/orders list and a 404 (not a 403, not the record)
  when requesting the first company's order directly by ID. This is the
  first time RLS was proven against two real, independently-registered
  tenants rather than two rows inserted by a test fixture.
- **Redis outage handling** — stopped the Memurai service and restarted the
  backend to see what actually happens (this surfaced a real bug, see
  below), then confirmed the fix, then confirmed normal reconnection after
  restarting Redis and the backend again.

**Found and fixed via this testing (not caught by any prior CI run):**
- `next-intl` request-config: see above.
- **Location-update hang on Redis outage.** `LocationsService.record()` —
  shared by both the REST `POST /couriers/me/location` endpoint and the
  WebSocket gateway — awaited `LocationCacheService.set()` first, before the
  Postgres write. The Socket.IO adapter's Redis client
  (`RedisIoAdapter`) already had a 5s-timeout-then-fallback wrapper and
  degrades correctly, confirmed working. The *other*, general-purpose Redis
  client (`redisClientProvider`, used only by `LocationCacheService`) had
  none: `lazyConnect: false` plus ioredis's default unlimited retry meant a
  queued command during an outage waited forever, which hung the calling
  request indefinitely — verified by actually killing Redis locally, not
  reasoned about in the abstract. Fixed by adding `commandTimeout`,
  `maxRetriesPerRequest: 1`, and a bounded `retryStrategy` to the client
  (`redis.provider.ts`), plus wrapping both `LocationCacheService` methods
  in try/catch so a cache failure logs and returns gracefully instead of
  propagating — matching the "cache is a nice-to-have, Postgres is the
  source of truth" design already stated in that file's own docstring.
  Confirmed: location updates now return in ~2s (not hang) during a Redis
  outage, and still correctly persist to Postgres.
- Also discovered along the way (tooling, not app code): `nest start
  --watch` does not reliably restart the running process on a file change
  in this environment — it recompiles ("Found 0 errors") but the old code
  keeps serving requests. A full process kill + restart is needed to
  actually pick up backend changes; don't trust the watcher alone when
  verifying a fix locally.

**Still genuinely unverified:**
- Live-location-update indicator specifically (as opposed to the
  "connected" status) and the dashboard's map/live-tracking UI, since there
  isn't one yet.

## Production readiness

Audited the codebase against "could this actually run in production" and
fixed what was clearly wrong regardless of hosting choice:

- **CORS was wide open** (`app.enableCors()`, no options — any origin,
  anywhere). Fixed: reads `CORS_ORIGIN` (comma-separated) from config, and
  **refuses to boot in production without it set** rather than silently
  defaulting to permissive. Dev/test stay permissive (no real attacker to
  defend against on a local machine).
- **No health check endpoint** — nothing for a load balancer/orchestrator to
  poll. Added `GET /health` (excluded from the `api/v1` prefix, so it's at
  the plain `/health` path most platforms expect), checks the DB connection
  specifically via `SELECT 1`, not just "is the process alive."
- **No TLS option for Postgres** — most managed providers (Render, Railway,
  Supabase, Neon, RDS) reject a plain connection outright. Added `DB_SSL`
  env var, wired into the TypeORM config.
- **No HTTP security headers** — added `helmet`.
- **No Dockerfiles** — added one per app (`apps/backend/Dockerfile`,
  `apps/dashboard/Dockerfile`), standard multi-stage pnpm-monorepo pattern.
  **Not build-tested** — this dev environment has no working Docker (see
  Prerequisites). Verify with `docker build` before relying on them.
- Rate limiting (`@nestjs/throttler`, 60 req/min) was already in place —
  confirmed, not new.

**Deliberately not solved here** (needs your input, not a code fix):
- **Hosting target.** Nothing here assumes a specific platform. Where this
  runs determines a lot: does it get a Dockerfile-based deploy (Render,
  Railway, Fly.io) or something else (a plain VPS, Vercel for the dashboard
  specifically)? Do you want managed Postgres/Redis or self-hosted?
- **Real secrets.** `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/DB passwords are
  still plain env vars — fine if your hosting platform has its own secret
  storage (most do), not fine committed anywhere or left as the dev values.
- **Running migrations against production data.** The Dockerfile's runtime
  stage only has compiled `dist/`, not the TypeScript `data-source.ts` +
  `ts-node` the migration CLI (`typeorm-ts-node-commonjs`) needs — migrations
  are meant to run as a deliberate separate step (e.g. in CI/CD, or from the
  `build` stage which still has full source), not automatically on every
  container boot. That's a scope decision, not an oversight: you want to see
  a migration plan before it touches real data, not have it fire silently.
- **A domain + DNS + SSL termination** — not decided, not set up.
- Google Maps billing (see "Live map" above) is its own open item.

## Security notes for whoever deploys this

- `docker/init-db.sql` is **local-dev only** — it hardcodes a password. Phase
  12 (production deployment) must provision the `courier_app` role's real
  password through a secrets manager, not this file.
- The RLS backstop only protects `couriers`, `vehicles`, `devices`, `orders`,
  `routes`, `navigation_sessions`, `location_points`, `deliveries`. It
  deliberately does **not** cover `users` — see the docstring in
  `apps/backend/src/database/migrations/1700000000001-EnableRowLevelSecurity.ts`
  for why (login needs a cross-tenant lookup by email before any tenant
  context exists). Application-level scoping in `UsersService` is the only
  boundary for that table — don't remove the `companyId` filter there.
- `User.passwordHash` and `Device.pairingTokenHash` are marked `@Exclude()`
  and stripped from every API response globally by `ClassSerializerInterceptor`
  (registered in `app.module.ts`) — including when loaded as a *nested*
  relation (e.g. `Courier.user`), which a manual per-endpoint strip would be
  easy to forget on a new endpoint. If you add another sensitive column to
  any entity, decorate it with `@Exclude()` rather than relying on the
  controller to remember to omit it.
