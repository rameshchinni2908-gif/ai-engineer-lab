# AI Engineer Lab

An interactive platform that teaches modern AI engineering to senior engineers. See
[`CLAUDE.md`](./CLAUDE.md) for the full project brief and build protocol.

> **Status:** Wave 0 scaffold. Module content, providers, and UI shell land in later waves —
> see [`docs/PROGRESS.md`](./docs/PROGRESS.md). This README gets a full quickstart
> (Docker, seed data, feature walkthrough) from the Wave 3 `architect` pass.

## Stack

pnpm workspaces monorepo: `apps/web` (React 18 + Vite), `apps/api` (Fastify), `packages/shared`
(Zod schemas + provider/store interfaces consumed by both).

## Quickstart

```bash
pnpm install
pnpm dev        # web on http://localhost:5173, api on http://localhost:8787
```

The app runs fully in **Mock mode** with zero API keys — see [`.env.example`](./.env.example).
Copy it to `.env` and fill in real provider keys only if you want to call them for real.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm dev` | Run web + api in watch mode |
| `pnpm build` | Build `@ail/shared` → `@ail/api` → `@ail/web` in order |
| `pnpm typecheck` | `tsc --noEmit` across every package |
| `pnpm lint` | ESLint across every package |
| `pnpm test` | Vitest (unit/integration) across every package |
| `pnpm test:e2e` | Playwright smoke tests (placeholder until Wave 3) |

## Docker

```bash
docker compose up
```

Starts `web`, `api`, and `qdrant`. See `docker-compose.yml` for TODOs still owned by the
Wave 3 `architect` pass (nginx proxy config, healthchecks).

## Monorepo layout

```
apps/web        React 18 + TS + Vite frontend
apps/api         Fastify + TS backend (routes -> services -> providers/stores)
packages/shared  Zod schemas + LLMProvider / VectorStore interfaces (the contract)
docs/            contracts.md, ADRs, architecture notes, build progress log
seed/            Seed data for datasets/documents (Wave 3)
```

See [`docs/contracts.md`](./docs/contracts.md) for the full API route table and SSE event
shapes, and [`docs/architecture-layering.md`](./docs/architecture-layering.md) for the backend
layering convention.
