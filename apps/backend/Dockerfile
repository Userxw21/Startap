# NOT build-tested — this dev environment has no working Docker (see
# README's "Live map" section history / the WSL2 note in the root README's
# Prerequisites). Standard pnpm-monorepo multi-stage pattern; verify with
# `docker build -f apps/backend/Dockerfile .` (build context must be the
# repo root, for the workspace files) before relying on it.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

# --- deps: install once, cached as long as lockfile/package.json files don't change ---
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile

# --- build: compile shared-types then the backend ---
FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared-types packages/shared-types
COPY apps/backend apps/backend
RUN pnpm --filter @courier/shared-types run build
RUN pnpm --filter @courier/backend run build

# --- runtime: only what's needed to run node dist/main.js ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared-types ./packages/shared-types
COPY --from=build /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /repo/apps/backend/dist ./apps/backend/dist
COPY --from=build /repo/apps/backend/package.json ./apps/backend/package.json

WORKDIR /repo/apps/backend
EXPOSE 3000
CMD ["node", "dist/main.js"]
