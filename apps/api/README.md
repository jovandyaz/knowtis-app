# Knowtis API

NestJS 11 backend for the Knowtis collaborative notes platform: JWT authentication with HttpOnly refresh cookies, CASL authorization, notes/tags/search, AI assistant and copilot agent, study artifacts, Hocuspocus collaboration, OAuth 2.1 authorization server for MCP clients, and PostgreSQL persistence through Drizzle ORM.

System-level design lives in [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md); this file covers what is specific to `apps/api`.

## Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Modules](#modules)
- [Patterns](#patterns)
- [Configuration](#configuration)
- [HTTP API](#http-api)
- [WebSocket Transports](#websocket-transports)
- [Database](#database)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Quick Start

Prerequisites: Node.js >= 22, pnpm >= 10, Docker.

```bash
# From the workspace root
pnpm docker:up                              # PostgreSQL 16 (pgvector) on 5432, Redis 7 on 6379
cp apps/api/.env.example apps/api/.env      # then fill in the required values (see Configuration)
pnpm db:migrate:run                         # apply committed migrations
pnpm dev:api                                # http://localhost:3333
```

Verify:

```bash
curl http://localhost:3333/api/v1/health/ping
# {"status":"ok","timestamp":"..."}
```

- REST: `http://localhost:3333/api/v1`
- Swagger UI (development only): `http://localhost:3333/api/docs`
- Collaboration WebSocket: `ws://localhost:3333/collaboration`

---

## Project Structure

```
apps/api/src/
├── adapters/       # SocketIoAdapter (Socket.io on the Nest HTTP server)
├── app/            # AppModule, AppController
├── assets/         # Static assets copied into the build
├── config/         # env.config.ts — Zod schema for environment variables
├── core/           # Cross-cutting: auth, domain, exceptions, filters, http,
│                   # interceptors, logging (Pino), pagination, swagger, throttling
├── database/       # Drizzle schema (27 tables), migrate.ts, baseline, module
├── i18n/           # Validation messages (en, es)
├── modules/        # Feature modules (below)
├── scripts/        # seed-admin.ts, generate-oauth-jwks.ts
├── test-support/   # DB test helpers, fixture-id guard
├── types/          # Ambient type declarations
└── main.ts         # Bootstrap: helmet, cookies, OIDC mount, /api prefix, URI versioning v1
```

## Modules

`apps/api/src/modules/` — 17 modules.

| Module          | Layout                 | Description                                                                                                                                         |
| --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`         | Service                | User management, AI metrics, admin audit log                                                                                                        |
| `agent`         | DDD                    | Conversational copilot: tool-use step loop, HITL proposals (Redis), long-term memory. See `modules/agent/README.md`                                 |
| `ai`            | DDD                    | Editor AI assistant (WebSocket streaming) plus the shared model layer: catalog, per-user preferences, system provider keys, reasoning effort        |
| `artifacts`     | DDD                    | Flashcards, quizzes, summaries, mind maps; spaced repetition                                                                                        |
| `auth`          | Controllers + services | Register/login/refresh/logout, email verification, password reset. Domain lives in `packages/auth` and `packages/auth-nestjs`; sessions in Postgres |
| `authorization` | Service                | CASL ability factory over `libs/authorization`                                                                                                      |
| `collaboration` | Service                | `HocuspocusService`: Hocuspocus on the `/collaboration` upgrade path, auth + persistence extensions, optional Redis extension. No Nest gateway      |
| `feature-flags` | Service                | DB-backed flags with an in-process `CacheModule` cache (30s TTL)                                                                                    |
| `health`        | Service                | Terminus health endpoints                                                                                                                           |
| `mcp`           | Service                | MCP API keys and API-key → JWT token exchange                                                                                                       |
| `notes`         | DDD                    | Notes CRUD with soft delete/restore, sharing, tags, image upload                                                                                    |
| `oauth`         | Service                | OAuth 2.1 authorization server (`oidc-provider`) for MCP clients: interactions, grants, Drizzle adapter                                             |
| `observability` | Service                | Langfuse OpenTelemetry tracing for AI paths                                                                                                         |
| `organization`  | DDD                    | AI suggestions for note buckets and tags                                                                                                            |
| `search`        | Service                | Full-text search over accessible notes                                                                                                              |
| `users`         | Service                | Profile updates, verified-identity policy                                                                                                           |
| `websocket`     | Service                | Socket.io handshake auth, per-instance concurrency slots, heartbeat                                                                                 |

DDD modules use `application/` (command and query handlers), `domain/` (entities, value objects, errors, ports), and `infrastructure/` (adapters). Wiring is in each `*.module.ts`.

## Patterns

### Result type (neverthrow)

Domain and application operations return `Result<T, E>` instead of throwing. Controllers convert with `unwrapOrThrow(result, ERROR_STATUS_MAP)`, which maps domain error codes to HTTP statuses.

```typescript
const title = NoteTitle.create(input.title);
if (title.isErr()) return err(title.error);
```

### Ports and adapters

Handlers depend on port interfaces from `domain/ports/` and receive adapters through NestJS DI tokens. In `notes`:

```typescript
// application/commands/create-note.handler.ts
@Inject(NOTE_WRITE_REPOSITORY) private readonly notes: NoteWriteRepository

// notes.module.ts
{ provide: NOTE_WRITE_REPOSITORY, useClass: DrizzleNoteWriteRepository }
```

The module wires six Drizzle adapters — `DrizzleNoteRepository`, `DrizzleNoteReadRepository`, `DrizzleNoteWriteRepository`, `DrizzlePermissionRepository`, `DrizzleTagRepository`, `DrizzleNoteImageRepository` — plus `VercelBlobStorage` for `IMAGE_STORAGE`. Handlers inject `NOTE_REPOSITORY`, `NOTE_READ_REPOSITORY`, `NOTE_WRITE_REPOSITORY`, `TAG_REPOSITORY`, `PERMISSION_REPOSITORY`, or `NOTE_IMAGE_REPOSITORY` as needed.

### Value objects

Immutable objects that validate on construction and return `Result`: `NoteTitle` (1–`NOTE_TITLE_MAX_LENGTH` = 200 chars), `NoteContent`, `PermissionLevel` (`viewer` | `editor`), `TagPath`, `SupertagAssignment` (`modules/notes/domain/value-objects/`).

### Request flow

```
Request → Controller → Handler → Value objects / domain logic → Port → Adapter → Postgres
                                        ↓
                        Result<T, E> → unwrapOrThrow() → HTTP response
```

---

## Configuration

`apps/api/.env.example` is the source of truth for variable names, defaults, and comments; `src/config/env.config.ts` validates them with Zod at boot. Do not maintain a second list here.

Boot-blocking variables:

| Variable             | Notes                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Required                                                                                                                   |
| `JWT_SECRET`         | Required, min 32 chars; must differ from `JWT_REFRESH_SECRET`; placeholder-looking values rejected in production           |
| `JWT_REFRESH_SECRET` | Required, min 32 chars                                                                                                     |
| `TOKEN_HASH_KEY`     | Required in every environment (32 bytes, base64). Keys every stored token hash; setting or rotating it logs every user out |
| `BACKOFFICE_URL`     | Required in production (separate refresh cookie per frontend); optional in development                                     |
| `REDIS_URL`          | Schema default `redis://localhost:6379`; production must set it explicitly                                                 |

AI variables are documented in [docs/AI.md → Environment Variables](../../docs/AI.md#environment-variables); OAuth variables (`OAUTH_ISSUER`, `OAUTH_JWKS`, `OAUTH_COOKIE_KEYS`, `MCP_RESOURCE_URL`) in [docs/MCP.md](../../docs/MCP.md).

---

## HTTP API

- Global prefix `/api`, URI versioning with default version `1` → every route is `/api/v1/...` (`main.ts`).
- Swagger UI at `/api/docs` when `NODE_ENV=development`.
- 25 controllers (`rg @Controller apps/api/src --glob '!*.spec.ts'`): `auth`, `notes`, `tags`, `search`, `ai`, `ai/models`, `ai/keys`, `ai/providers`, `ai/catalog`, `ai/organization`, `agent/memories`, `artifacts`, `notes/shared`, `admin`, `users`, `flags`, `mcp/keys`, `auth/token-exchange`, `oauth/grants`, `oauth/interactions`, `health`.
- Authentication: `Authorization: Bearer <accessToken>`; refresh token in an HttpOnly cookie (`rid` / `rid_bo`, path `/api/v1/auth`). See [docs/AUTH.md](../../docs/AUTH.md).
- Rate limit: 60 requests per 60 s window, keyed per registered user (per IP for anonymous callers) — `core/throttling/`.
- Pagination envelope: `{ items, total, page, limit }`; defaults `page=1`, `limit=25`; ceilings `MAX_PAGE` and `MAX_LIMIT` (100) in `core/pagination/pagination.constants.ts`.
- Error shape (`core/filters/http-exception.filter.ts`): `{ statusCode, message, error, code?, errors?, timestamp, path }`. 5xx responses have their message redacted to `Internal server error`.

### Health

| Endpoint               | Behaviour                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/health/ping`  | `{ status: 'ok', timestamp }` — liveness; Railway healthcheck                                                                                             |
| `/api/v1/health/ready` | Terminus check of database connectivity; 503 when unreachable                                                                                             |
| `/api/v1/health`       | Terminus check of database connectivity and RSS against 90% of the container memory limit; a 503 body is the Terminus result naming the failing indicator |

---

## WebSocket Transports

| Transport  | Path / namespace | Auth                                                   | Events                                                                                                                                                                        |
| ---------- | ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hocuspocus | `/collaboration` | JWT via `HocuspocusProvider`'s `token` callback        | Binary y-protocols sync + awareness; no named events                                                                                                                          |
| Socket.io  | `/ai`            | JWT in `socket.auth.token` (or `Authorization` header) | in: `ai:complete`, `ai:cancel` — out: `ai:chunk`, `ai:done`, `ai:error`                                                                                                       |
| Socket.io  | `/agent`         | same                                                   | in: `agent:message`, `agent:cancel`, `agent:approve`, `agent:reject` — out: `agent:thinking`, `agent:chunk`, `agent:proposal`, `agent:committed`, `agent:done`, `agent:error` |

Payloads and error codes: [docs/AI.md → WebSocket Protocol](../../docs/AI.md#websocket-protocol) and `modules/agent/README.md`.

---

## Database

PostgreSQL 16 with the `vector` extension (`pgvector/pgvector:pg16` in `docker-compose.yml` and CI). Schema: `src/database/schema/` (27 tables); browse with `pnpm db:studio`.

| Command               | Purpose                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm db:generate`    | Generate a migration from schema changes (`apps/api/drizzle/`)                                     |
| `pnpm db:migrate:run` | Apply migrations via `src/database/migrate.ts` (advisory lock, lock-timeout retry). Canonical path |
| `pnpm db:baseline`    | Record existing migrations as applied on a DB that was previously managed with `db:push`           |
| `pnpm db:seed:admin`  | Create an admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`                                         |
| `pnpm db:studio`      | Drizzle Studio                                                                                     |
| `pnpm db:push`        | Throwaway local databases only; leaves no migration history                                        |

Workflow, bootstrap, and zero-downtime guidance: [docs/MIGRATIONS.md](../../docs/MIGRATIONS.md).

---

## Testing

```bash
nx test api              # all specs once
nx test api --watch
nx test api --coverage
```

Tests are co-located with the code they cover. Specs that hit the real Postgres are named `*.db.spec.ts`; `vitest.config.ts` runs them sequentially in their own project so fixture teardowns cannot race, and `src/test-support/fixture-ids.spec.ts` fails when a database-touching spec misses the suffix or two db specs share a fixture id. There is no supertest layer; integration coverage is handlers and repositories against the database.

---

## Deployment

Production runs on Railway with the nixpacks builder (`railway.toml`); there is no Dockerfile. Build with `pnpm build:api` (output `dist/apps/api/main.js`), start with `node dist/apps/api/main.js`; migrations run in Railway's `preDeployCommand`. See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).

---

## Related Documentation

- [Root README](../../README.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Authentication](../../docs/AUTH.md)
- [AI Module](../../docs/AI.md)
- [MCP Server](../../docs/MCP.md)
- [Migrations](../../docs/MIGRATIONS.md)
- [Deployment](../../docs/DEPLOYMENT.md)
