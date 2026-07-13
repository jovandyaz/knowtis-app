# Local Setup

Get Knowtis running locally in one shot, and connect an MCP client (Claude Desktop, Cursor, VS Code) to your local notes.

This guide is the ground truth for onboarding. It documents the exact working sequence plus the friction points that aren't obvious from the scripts.

## TL;DR

```bash
git clone git@github.com:jovandyaz/knowtis_app.git
cd knowtis_app
pnpm setup       # Node/Docker checks, scaffolds .env files, installs deps, starts Docker, pushes schema
pnpm dev:all     # API (:3333) + frontend (:4200)
```

Open <http://localhost:4200>, register, and you're in. To also run the MCP server locally:

```bash
pnpm dev:mcp     # MCP server (:3334)
```

## Prerequisites

| Requirement | Version  | Notes                                                                                                                                           |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js     | **22.x** | `pnpm setup` hard-fails on anything older. `nvm install 22 && nvm use 22`.                                                                      |
| pnpm        | ≥ 10.x   | Never use `npm`/`yarn` in this repo.                                                                                                            |
| Docker      | ≥ 20.x   | **Docker Desktop must be running** before `pnpm setup` — the script checks `docker info` and aborts with a clear message if the daemon is down. |

## What `pnpm setup` does

Runs [`tools/setup.mjs`](../tools/setup.mjs) in order, aborting on the first failure:

1. Assert Node ≥ 22.
2. Assert the Docker daemon is up.
3. Scaffold `.env` from `.env.example` for `apps/api`, `apps/notes`, `apps/mcp` — **idempotent**, never overwrites an existing `.env`.
4. `pnpm install`.
5. `pnpm docker:up` — Postgres (pgvector/pg16) + Redis.
6. Wait for Postgres to accept connections.
7. `pnpm db:push` — sync the Drizzle schema into the fresh local DB.

> `db:push` is fine for a throwaway **local** DB. For any shared/long-lived DB the source of truth is `pnpm db:migrate:run` — never `db:push` a shared database. See [MIGRATIONS.md](./MIGRATIONS.md).

## Services & ports

| Service            | URL                                   | Start command    |
| ------------------ | ------------------------------------- | ---------------- |
| Frontend (notes)   | <http://localhost:4200>               | `pnpm dev`       |
| API                | <http://localhost:3333/api/v1>        | `pnpm dev:api`   |
| API health         | <http://localhost:3333/api/v1/health> | —                |
| API docs (Swagger) | <http://localhost:3333/api/docs>      | —                |
| MCP server         | <http://localhost:3334/mcp>           | `pnpm dev:mcp`   |
| MCP health         | <http://localhost:3334/health>        | —                |
| Collaboration WS   | ws://localhost:3333/collaboration     | (with API)       |
| DB Studio          | —                                     | `pnpm db:studio` |

## Design tokens build to nothing to do

The design system generates its CSS variables (`packages/design-system/build/css/variables.css`) from token JSON via Style Dictionary. That `build/` directory is **git-ignored**, so a fresh clone doesn't have it, and `apps/notes/src/index.css` imports it — a missing file crashes the Vite dev server with:

```
[plugin:@tailwindcss/vite] Can't resolve '../build/css/variables.css'
```

**You don't need to do anything about this.** `notes:serve` and `notes:build` both declare `dependsOn: ["^build"]`, so Nx runs `design-system:build` (which regenerates the tokens) before the app starts, on any of `pnpm dev`, `pnpm dev:all`, or `pnpm build`. The result is cached, so it's a one-time cost.

If you ever want to regenerate tokens by hand (e.g. after editing `packages/design-system/tokens/*.json`):

```bash
pnpm nx run design-system:tokens:build
```

## Getting past the login wall to reach Settings

Two things trip up first-time local runs:

1. **Settings is a modal, not a route.** There is no `/settings/integrations` URL — open it from the user menu (bottom-left avatar → **Settings**). The modal only renders for a signed-in, **non-anonymous** user.
2. **Register requires email verification, and local dev sends no email.** After you register, the app shows "Check your email" and gates Settings until the address is verified. Locally there is no mail transport, so verify directly in the DB:

```bash
docker exec knowtis-postgres psql -U knowtis -d knowtis \
  -c "UPDATE users SET email_verified_at = now() WHERE email = 'you@example.com';"
```

Then sign in again — the user menu and Settings become available. (DB user and database are both `knowtis`, per `apps/api/.env`.)

## Connecting an MCP client locally

The MCP server exposes your notes to AI clients. There are two auth paths.

### API key (works out of the box locally)

OAuth "click to connect" is **on by default** (the `mcp_oauth` flag seeds `true`). It activates once the OAuth env is set on both services (below); until then, discovery stays dormant and clients fall back to API keys.

1. Sign in (see above), open **Settings → Integrations**.
2. Expand **Advanced: API keys** → **Create API Key** → pick a permission level (default is read + write) → copy the `knowtis_mcp_...` key.
3. Point your MCP client at `http://localhost:3334/mcp` with `Authorization: Bearer knowtis_mcp_...`.

Sanity check the server:

```bash
curl -s http://localhost:3334/health          # {"status":"ok",...}
```

### OAuth (to exercise the browser connect flow / scope challenge)

The one-click connector in **Settings → Integrations** is the primary path in production. To exercise the OAuth pieces locally, point the MCP server at an OAuth issuer + resource URL.

**The MCP server needs an OAuth issuer + resource URL.** Add to `apps/mcp/.env` and restart `pnpm dev:mcp`:

```bash
MCP_OAUTH_ISSUER=http://localhost:3333
MCP_RESOURCE_URL=http://localhost:3334/mcp
```

With those set, the unauthenticated `401` now advertises the full scope set (this is what lets a client request write/share/refresh, not just read):

```bash
curl -si -X POST http://localhost:3334/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  | grep -i www-authenticate
# Bearer resource_metadata="...", scope="notes:read notes:write notes:share offline_access"
```

See [MCP.md](./MCP.md) for the full protocol details (discovery, PKCE, scopes, endpoints).

## Troubleshooting

| Symptom                                              | Cause                                                                      | Fix                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Docker is not running` on `pnpm setup`              | Daemon down                                                                | Start Docker Desktop, re-run `pnpm setup`.                                                   |
| `Can't resolve '../build/css/variables.css'` overlay | Tokens not built (very old checkout without the `serve` dependsOn)         | `pnpm nx run design-system:tokens:build`, then restart. On current `main` this is automatic. |
| `Node 22.x required`                                 | Wrong Node                                                                 | `nvm install 22 && nvm use 22`.                                                              |
| Register works but Settings never appears            | Email unverified (no local mail)                                           | Run the `email_verified_at` SQL above, sign in again.                                        |
| MCP OAuth discovery returns `404`                    | OAuth env (`MCP_OAUTH_ISSUER`/`MCP_RESOURCE_URL`, API's `OAUTH_*`) not set | Set the OAuth env vars (see above), or use the API-key path.                                 |
| `role "postgres" does not exist`                     | Wrong psql user                                                            | The local DB user is `knowtis`, not `postgres`.                                              |
| Port already in use (`4200`/`3333`/`3334`)           | Stale dev server                                                           | `lsof -ti:4200 \| xargs kill -9` (swap the port).                                            |
