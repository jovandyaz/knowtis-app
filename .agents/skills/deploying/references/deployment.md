# Deployment runbook

Canonical source: `docs/DEPLOYMENT.md` in the knowtis repo (re-sync this file when it changes).

## Topology

Vercel hosts the notes and backoffice React/Vite frontends as separate projects. Railway hosts the NestJS API, standalone MCP server, Postgres, and Redis. WebSockets terminate on the API service.

## Railway API (`railway.toml`)

```toml
[build]
builder = "nixpacks"
buildCommand = "NODE_ENV=development pnpm install --frozen-lockfile && pnpm build:api"

[deploy]
preDeployCommand = "pnpm exec tsx apps/api/src/database/migrate.ts"
startCommand = "node dist/apps/api/main.js"
healthcheckPath = "/api/v1/health/ping"
healthcheckTimeout = 120
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

- `NODE_ENV=development` in the build so build-only devDependencies (nx, tsx) install.
- Pre-deploy = the only production migrator (advisory-locked, abort-on-failure). CI migrates only its test database.
- CI deploys through `.github/scripts/railway-deploy.sh`, which waits for `SUCCESS` or `SKIPPED` and fails on terminal errors, disappearance, or timeout.

## Railway MCP (`apps/mcp/railway.toml`)

```toml
[build]
builder = "nixpacks"
buildCommand = "NODE_ENV=development pnpm install --frozen-lockfile && pnpm nx build mcp"

[deploy]
startCommand = "node dist/apps/mcp/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 60
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

The MCP service has no database pre-deploy migration. Its CI job pins `NODE_ENV` and `MCP_ALLOWED_HOSTS`, verifies OAuth variable parity with the API, and then calls the same gated deploy script.

### Env vars (API)

Required: `DATABASE_URL` (prefer `${{Postgres.DATABASE_URL}}`), `JWT_SECRET`, `JWT_REFRESH_SECRET` (at least 32 chars), `TOKEN_HASH_KEY` (exactly 32 bytes encoded as base64), and `FRONTEND_URL`. Set `BACKOFFICE_URL` when backoffice is enabled. `REDIS_URL` is required for multi-instance collaboration fan-out. AI features additionally need provider keys and DB flags.

Introducing or rotating `TOKEN_HASH_KEY` invalidates every existing session, reset token, and verification token. Treat it as a planned global logout.

### API health endpoints

`/api/v1/health/ping` (liveness, Railway gate), `/api/v1/health/ready` (readiness + flags), `/api/v1/health` (full status + memory).

## Vercel

Frontend env (Dashboard → Settings): `VITE_API_URL=https://<railway-domain>/api/v1`, `VITE_WS_URL=https://<railway-domain>`, `VITE_COLLABORATION_MODE=websocket`.

The notes and backoffice jobs each run `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`, gated on their app being affected and a push to `main`. Backoffice uses `apps/backoffice/vercel.json` and a separate Vercel project.

## GitHub secrets/variables

`RAILWAY_TOKEN` (secret), `RAILWAY_SERVICE_ID` (variable), `RAILWAY_MCP_SERVICE_ID` (optional variable), `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_PROJECT_ID_BACKOFFICE` (secrets).

## Useful commands

```bash
curl https://<api>/api/v1/health/ping   # liveness
railway logs                            # service logs
openssl rand -hex 32                    # JWT secret generation
openssl rand -base64 32                 # TOKEN_HASH_KEY generation
```
