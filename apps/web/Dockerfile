# node:22-bookworm-slim for the build stage; static output served by nginx.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
# Root package.json's `prepare` lifecycle script runs `pnpm --filter=@ail/shared
# build` automatically on every `pnpm install`, so `packages/shared`'s source +
# tsconfig must exist BEFORE `pnpm install` runs here, not just its
# package.json like the other workspace packages.
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter=@ail/web... || pnpm install --filter=@ail/web...

FROM deps AS build
COPY apps/web apps/web
RUN pnpm --filter=@ail/shared build && pnpm --filter=@ail/web build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
