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
(rather than the not-yet-built mobile app) sees a one-screen "this isn't for
you" notice instead of the normal Sidebar/Overview — every dashboard page
calls COMPANY_ADMIN/DISPATCHER-only backend endpoints, so there was nothing
useful to show them anyway. See `CourierNotice` and the role check at the
top of `(dashboard)/layout.tsx`.

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

**Still genuinely unverified:**
- The Redis adapter's timeout-and-fallback path specifically — confirmed
  connected and working, but the 5s-timeout-then-fallback-to-in-memory
  branch itself was never actually triggered (Redis/Memurai was up the
  whole time).
- Orders/analytics pages, and the live-location-update indicator
  specifically (as opposed to the "connected" status) — the golden-path
  click-through above covered auth, invites, and courier onboarding, not
  every page.

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
