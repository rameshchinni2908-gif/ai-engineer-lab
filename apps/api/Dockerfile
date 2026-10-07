# node:22-bookworm-slim (glibc, NOT alpine) so better-sqlite3's native addon
# loads without musl issues.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
# Root package.json's `prepare` lifecycle script runs `pnpm --filter=@ail/shared
# build` automatically on every `pnpm install` (so a plain `pnpm install` in a
# fresh clone is already buildable) - which means `packages/shared`'s actual
# source + tsconfig must exist BEFORE `pnpm install` runs here, not just its
# package.json like the other workspace packages (only needed by `pnpm`
# itself for dependency resolution at this stage).
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter=@ail/api... || pnpm install --filter=@ail/api...

FROM deps AS build
COPY apps/api apps/api
COPY seed seed
RUN pnpm --filter=@ail/shared build && pnpm --filter=@ail/api build

FROM base AS runtime
ENV NODE_ENV=production
# pnpm's node_modules are symlink trees pointing back into a shared
# /app/node_modules/.pnpm content-addressable store (confirmed by inspecting
# apps/api/node_modules/better-sqlite3 -> ../../node_modules/.pnpm/...). Copying
# only apps/api/node_modules without that store produces dangling symlinks -
# better-sqlite3's native addon in particular would fail to load. Copying the
# whole /app tree from the build stage (root node_modules + the store +
# apps/api, but NOT apps/web, which was never installed/built in this
# Dockerfile's `deps`/`build` stages) keeps every symlink resolvable.
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 8787
CMD ["node", "dist/server.js"]
