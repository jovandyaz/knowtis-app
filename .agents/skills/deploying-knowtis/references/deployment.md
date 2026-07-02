# Deployment runbook

Canonical source: `docs/DEPLOYMENT.md` in the knowtis repo (re-sync this file when it changes).

## Topology

Vercel (React/Vite frontend) → Railway (NestJS API + standalone MCP server) → Railway Postgres + Redis. WebSockets (Socket.io + Hocuspocus) terminate on the API service.

## Railway (`railway.toml`)

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
- Pre-deploy = the only migrator (advisory-locked, abort-on-failure).

### Env vars (API)

Required: `DATABASE_URL` (use `${{Postgres.DATABASE_URL}}` reference syntax), `JWT_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars, `openssl rand -hex 32`), `FRONTEND_URL` (CORS). Optional: `REDIS_URL` (`${{Redis.REDIS_URL}}` — required for multi-instance collab fan-out), `JWT_EXPIRES_IN` (15m), `JWT_REFRESH_EXPIRES_IN` (7d). AI features additionally need `ANTHROPIC_API_KEY` + DB flags (+ `BYOK_ENCRYPTION_KEY` for BYOK).

### Health endpoints

`/api/v1/health/ping` (liveness, Railway gate), `/api/v1/health/ready` (readiness + flags), `/api/v1/health` (full status + memory).

## Vercel

Frontend env (Dashboard → Settings): `VITE_API_URL=https://<railway-domain>/api/v1`, `VITE_WS_URL=https://<railway-domain>`, `VITE_COLLABORATION_MODE=websocket`.

Deploy job: `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`, gated on `notes` affected + push to `main`.

## GitHub secrets/variables

`RAILWAY_TOKEN` (secret), `RAILWAY_SERVICE_ID` (var), `RAILWAY_MCP_SERVICE_ID` (var, optional), `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` (secrets).

## Useful commands

```bash
curl https://<api>/api/v1/health/ping   # liveness
railway logs                            # service logs
railway up --service <SERVICE_ID>       # manual deploy (emergency only)
openssl rand -hex 32                    # JWT secret generation
```
