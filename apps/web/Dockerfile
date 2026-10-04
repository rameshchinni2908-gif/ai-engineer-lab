# node:22-bookworm-slim for the build stage; static output served by nginx.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter=@ail/web... || pnpm install --filter=@ail/web...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm --filter=@ail/shared build && pnpm --filter=@ail/web build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# TODO(wave-3 architect): add nginx.conf with /api -> api:8787 proxy_pass and
# SPA fallback (try_files ... /index.html), then COPY it in here.
EXPOSE 80
