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
- Docker Desktop (for Postgres/PostGIS + Redis)

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
POST   /api/v1/users/dispatchers         COMPANY_ADMIN

POST   /api/v1/couriers                  COMPANY_ADMIN, DISPATCHER  (onboard: creates User+Vehicle+Courier)
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

`.github/workflows/ci.yml` runs on every push/PR (once this repo is actually
pushed to GitHub — it isn't yet, this is purely local right now) and is, as
of writing, **the fastest way to get real execution feedback on this whole
project** without needing Node.js/Docker installed locally first: a fresh
Ubuntu runner, real Postgres+PostGIS and Redis service containers, and it
runs migrations, the full backend build, unit tests, e2e tests, and a
dashboard build/type-check — the exact things flagged throughout this README
as "reasoned carefully, not executed."

Two things about it are themselves unverified (everything about this
repository is, per the running theme):
- **No `pnpm-lock.yaml` is committed** — there was never a Node.js
  environment available to generate one, so the workflow uses plain
  `pnpm install` instead of `--frozen-lockfile`, and skips `setup-node`'s
  pnpm cache (which requires a lockfile to hash). The very first real
  `pnpm install` anyone runs (locally or by pushing this to GitHub and
  watching CI attempt it) should have its resulting `pnpm-lock.yaml`
  committed — after that, switch both jobs to `--frozen-lockfile` and
  re-enable the pnpm cache for faster, more reproducible runs.
- **The dashboard job never ran either.** It builds/type-checks but doesn't
  start a live backend, since every dashboard page reads `cookies()` and is
  therefore forced-dynamic (never pre-rendered at build time) — so this
  step can't fail due to an unreachable backend, but it also doesn't prove
  a real login-and-click-through works. That's still a manual (or future
  Playwright) verification step.

If you push this to GitHub and the backend job fails, the single most
likely culprit is whichever raw-SQL/PostGIS code this README has already
flagged as unverified — check those sections first before assuming the CI
config itself is wrong.

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
- A real device-invite flow for dispatchers/couriers (right now an admin sets
  the initial password directly in the request body — fine for MVP/manual
  onboarding, but a magic-link or SMS-OTP invite is the real production flow)

## ⚠ One thing that genuinely needs verifying first

`OrdersService` (create/list/get/transition) uses **raw parameterized SQL**
(`ST_MakePoint` on write, `ST_X`/`ST_Y` on read) for every query touching
`pickupLocation`/`deliveryLocation`, instead of TypeORM's `save()`/`find()`.
This was a deliberate choice, not an oversight: TypeORM does have some
built-in geometry/geography handling, but there was no live Postgres/PostGIS
available while writing this to actually confirm its exact behavior in this
TypeORM version — and shipping unverified ORM behavior on the one part of
the schema that's hardest to eyeball-review felt worse than writing
SQL I could reason about by hand with confidence.

**Run `test/orders.e2e-spec.ts` first**, before building anything on top of
Orders — its first test creates an order and asserts the returned
coordinates match what was sent, which is exactly the thing to confirm. If
it passes, the raw-SQL approach is solid; if not, that's the file to fix.

**The dashboard has the same caveat, for the same reason**: it was written
with no Node.js available in this environment to actually run `next dev`
against it, so nothing about it has executed even once. The most likely
failure points, if something breaks on first run:
- `middleware.ts` lives at `apps/dashboard/src/middleware.ts` (not the
  project root) because the app directory is under `src/` — this matches
  Next.js's documented convention, but double-check it's actually being
  picked up (you'll know immediately: visiting a protected page while logged
  out should redirect to `/login` — if it doesn't, the middleware isn't running).
- The Server Actions bound with `.bind(null, order.id)` in
  `orders/[id]/page.tsx` (a documented Next.js pattern for passing extra
  arguments to a form action) — worth a first-click confirmation on the
  "assign courier" and "cancel" buttons.
- `next-intl` version compatibility with Next.js 14.2.15 — the package
  versions in `package.json` are what I'd pick with confidence, not what
  I've run.

None of this is exotic — it's the same "reasoned carefully, not executed"
situation as the Orders module above, just for a different stack. Try
`/login` first, then `/overview`, and report back whatever breaks.

**Same caveat again for the realtime module** — also written and never run.
The parts most worth a skeptical first look:
- The WS handshake auth (`RealtimeGateway.handleConnection` reading
  `client.handshake.auth.token`) — confirm a bad/missing token actually gets
  disconnected, and a good one joins the right room, before trusting the
  tenant isolation on this side.
- `LocationsService`'s raw `ST_MakePoint` INSERT — same category of risk as
  `OrdersService`'s, see above.
- The Redis adapter's 5s timeout-and-fallback in `RedisIoAdapter` — I
  reasoned through the happy path and the "Redis is down" path, but haven't
  watched it actually fall back.

`realtime-test.html`'s two-tab walkthrough (above) is the fastest way to
build confidence in all three at once.

**And the dashboard's realtime wiring** — same situation again. Specifically
worth a first look: `/api/realtime-token` actually returning 401 when logged
out (not silently returning `{token: undefined}` and having the socket hang
in "connecting" forever), and `RealtimeRefresher`'s debounce actually
coalescing a burst of events into one `router.refresh()` rather than
firing one refresh per event.

**And `AnalyticsService`** — the `ST_Distance` query is the same "reasoned
by hand, not run" PostGIS situation as `OrdersService`/`LocationsService`.
The two CTE-based time-average queries (delivery time, dispatch time) are
plain SQL with no PostGIS involved, lower risk, but still worth a glance —
specifically that `AVG(EXTRACT(EPOCH FROM ...))` returns seconds as expected
and not some other unit, before trusting the numbers on the page.

**And `packages/shared-types`** — a different kind of risk than the others:
not PostGIS/SQL correctness, but whether the `predev`/`prebuild` hooks
actually make both apps resolve `@courier/shared-types` cleanly on a fresh
`pnpm install`. I reasoned through why compiled output (not raw `.ts`) was
the safer choice for cross-toolchain resolution (see "Shared types" above),
but a pnpm workspace's exact resolution behavior is precisely the kind of
thing that's easy to get subtly wrong without running it. If either app
fails to start with a "cannot find module '@courier/shared-types'" or
similar, run `pnpm --filter @courier/shared-types run build` by hand and
check `packages/shared-types/dist/` actually has `index.js`/`index.d.ts` in it.

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
