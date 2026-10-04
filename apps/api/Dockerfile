# node:22-bookworm-slim (glibc, NOT alpine) so better-sqlite3's native addon
# loads without musl issues.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter=@ail/api... || pnpm install --filter=@ail/api...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm --filter=@ail/shared build && pnpm --filter=@ail/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 8787
# TODO(wave-3 architect): verify node_modules copy strategy once better-sqlite3
# native binary + workspace symlinks are confirmed working inside this image.
CMD ["node", "dist/server.js"]
