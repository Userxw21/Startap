# NOT build-tested — no working Docker in this dev environment (see root
# README's Prerequisites). Standard pnpm + Next.js `output: standalone`
# multi-stage pattern; verify with
# `docker build -f apps/dashboard/Dockerfile .` (build context must be the
# repo root) before relying on it.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /repo/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared-types packages/shared-types
COPY apps/dashboard apps/dashboard
RUN pnpm --filter @courier/shared-types run build
# BACKEND_API_URL / NEXT_PUBLIC_* must be real at build time — Next.js
# inlines NEXT_PUBLIC_* into the client bundle during `next build`, and
# Server Components read the others at request time but the build itself
# runs each page's data-fetching path enough to need something set. Pass
# as --build-arg and re-declare as ENV here, or bake real values into a
# .env.production file before building — not solved by this Dockerfile,
# since the right values depend on where this actually gets deployed.
RUN pnpm --filter @courier/dashboard run build

# --- runtime: Next.js standalone output — a pruned node_modules + server.js, not the full monorepo ---
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/dashboard
COPY --from=build /repo/apps/dashboard/.next/standalone ./
COPY --from=build /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /repo/apps/dashboard/public ./apps/dashboard/public

EXPOSE 3001
ENV PORT=3001
CMD ["node", "apps/dashboard/server.js"]
