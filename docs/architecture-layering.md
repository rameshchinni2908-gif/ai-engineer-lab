# API layering convention

`apps/api/src` is organized strictly as:

```
routes/       Fastify route handlers. Parse + validate (Zod) the request,
              call exactly one service function, shape the HTTP/SSE response.
              NO business logic, NO direct DB/provider/vector-store access.

services/     Business logic. Orchestrates providers/stores/db, computes
              costs, builds Runs/Traces, runs guardrails, etc. Pure
              TypeScript, framework-agnostic (no Fastify imports here).

providers/    LLMProvider implementations (Anthropic, OpenAI, Ollama, Mock).

stores/       VectorStore implementations (InMemory, Qdrant) and any other
              external-storage adapters besides the SQLite db/ module.

plugins/      Fastify plugins (e.g. rate limiting, request-id, Zod
              validation/serialization glue) registered once in app.ts.

middleware/   Cross-cutting request hooks that aren't full Fastify plugins
              (e.g. small onRequest/onSend hooks).

db/           SQLite access (schema, migrations, driver abstraction).
```

Dependency direction is one-way: `routes -> services -> providers/stores/db`.
Services and below must never import from `routes/`. This keeps every piece
unit-testable without an HTTP server and keeps parallel agents from treading
on each other's files.
