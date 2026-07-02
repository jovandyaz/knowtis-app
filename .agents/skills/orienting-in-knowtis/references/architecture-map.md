# Knowtis architecture map

Canonical sources: `CLAUDE.md` and `docs/ARCHITECTURE.md` in the knowtis repo.

## Monorepo layout

```
apps/
├── api/     NestJS 11 backend — modules: admin, agent (copilot), ai (single-shot),
│            artifacts, auth, authorization, collaboration, feature-flags, health,
│            mcp, notes, observability, users, websocket
├── mcp/     Standalone MCP server (Hono) for AI assistants
└── notes/   React 19 frontend (Vite, TanStack Router)

libs/        App-specific libraries
├── api-client/      HTTP/WebSocket client for the frontend (type:data-access)
├── authorization/   CASL permission definitions shared FE/BE
└── data-access/     React Query hooks + Zod schemas per domain
    (artifacts, feature-flags, mcp-keys, notes, users)

packages/    Framework-light, reusable
├── ai-gateway/      Framework-free AI gateway core — ZERO workspace deps (extractable)
├── auth/ auth-react/ auth-nestjs/         (@jovandyaz/*)
├── crdt/            Yjs/CRDT helpers
├── design-system/   UI components + tokens (Storybook, type:ui)
├── editor/ editor-schema/                  Tiptap editor + schema
├── email/ email-nestjs/                    (@jovandyaz/*)
├── permissions/ permissions-react/ permissions-nestjs/  (@jovandyaz/*)
└── shared/          hooks/ i18n/ types/ util/ — no internal workspace deps
```

## Dependency flow (ESLint-enforced)

`type:app` → {`type:ui`, `type:data-access`} → `type:util`.

- `api-client` is `type:data-access`; `design-system` is `type:ui` (outside the data-access chain).
- Scopes: `scope:shared` usable by all; `scope:notes` depends only on shared/notes; `scope:api` only on shared/api.
- `packages/ai-gateway` has zero workspace dependencies by design — keep it that way.

## Backend layering (DDD, per module)

`domain/` (framework-free: entities, value objects with `create()` factories returning neverthrow `Result`, ports as interface + Symbol token) → `application/` (thin one-`execute` handlers, transport-agnostic) → `infrastructure/` (Drizzle repositories in `persistence/`, adapters). Domain has ZERO infrastructure imports.

## Key subsystem locations

| Concern | Where |
| --- | --- |
| Copilot (conversational agent, HITL) | `apps/api/src/modules/agent/` — see building-copilot-features skill |
| Single-shot AI (inline assistant) | `apps/api/src/modules/ai/` |
| AI gateway (providers, fallback, injection guard) | `packages/ai-gateway/` + `docs/AI.md` |
| Realtime collaboration (Yjs/Hocuspocus) | `apps/api/src/modules/collaboration/` — see wiring-realtime-collaboration skill |
| AuthN (JWT, refresh rotation) | `apps/api/src/modules/auth/` + `@jovandyaz/auth*` + `docs/AUTH.md` |
| AuthZ (CASL, single ability HTTP+WS) | `libs/authorization/` + `docs/PERMISSIONS.md` |
| DB schema + migrations | `apps/api/src/database/schema/` + `apps/api/drizzle/` + `docs/MIGRATIONS.md` |
| MCP server (7 tools, API-key→JWT exchange) | `apps/mcp/` + `apps/api/src/modules/mcp/` + `docs/MCP.md` |

## Essential commands

```bash
pnpm dev            # frontend (localhost:4200)
pnpm dev:api        # backend (localhost:3333)
pnpm docker:up      # Postgres + Redis
pnpm db:generate    # migration from schema changes
pnpm db:migrate:run # apply migrations
pnpm nx affected -t lint test build   # simulate CI
nx run api:eval     # copilot eval harness (opt-in, needs docker + API keys)
```
