# Knowtis Deployment Guide

How Knowtis is deployed to production: Railway (API + MCP) and Vercel (notes frontend + backoffice).

## Architecture

```
┌─────────────────┐ ┌─────────────────┐     ┌─────────────────┐
│     Vercel      │ │     Vercel      │     │     Railway     │
│  Notes frontend │ │   Backoffice    │────▶│  API (NestJS)   │
│  knowtis.app    │ │ backoffice.     │     │  + MCP (Hono)   │
│                 │ │  knowtis.app    │     └────────┬────────┘
└────────┬────────┘ └─────────────────┘              │
         └──────────────────────▶───┌────────────────┼────────────┐
                                    │                │            │
                               ┌────▼─────┐    ┌─────▼───┐ ┌──────▼────┐
                               │PostgreSQL│    │  Redis  │ │ WebSocket │
                               │(Railway) │    │(Railway)│ │(Socket.io)│
                               └──────────┘    └─────────┘ └───────────┘
```

---

## How Deployments Work

### Backend (Railway) — CI-driven

Deployments are triggered by the **CI pipeline**, not by Railway's GitHub integration.

```
Push to main → GitHub Actions CI → lint, typecheck, test, build → deploy → wait for SUCCESS
```

The CI pipeline (`.github/workflows/ci.yml`) runs all checks first. Only after everything passes, the `deploy` job runs `.github/scripts/railway-deploy.sh` in the Railway CLI container.

That script starts the deploy detached and then polls until the deployment reaches a terminal status: `SUCCESS` and `SKIPPED` (Railway found nothing to ship) pass; `FAILED`, `CRASHED`, `REMOVED`, a listing that never contains the deployment, or a 15-minute timeout fail the job. Plain `railway up` returns when the **build** log stream closes — before `preDeployCommand` and the healthcheck — so it would report success on a deploy whose migration later failed. `.github/workflows/deploy-gate.yml` runs `.github/scripts/railway-deploy.test.sh` on any change under `.github/scripts/`.

**Config files:**

| File                                 | Purpose                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| `railway.toml`                       | Build/start commands, healthcheck, pre-deploy migrations |
| `.github/workflows/ci.yml`           | CI pipeline with deploy step                             |
| `.github/workflows/nightly-eval.yml` | Scheduled AI eval run (no deploy)                        |

**Required GitHub secrets/variables:**

| Name                           | Type     | Purpose                                                       |
| ------------------------------ | -------- | ------------------------------------------------------------- |
| `RAILWAY_TOKEN`                | Secret   | Project token for Railway CLI (API + MCP deploys)             |
| `RAILWAY_SERVICE_ID`           | Variable | API service ID for `railway up`                               |
| `RAILWAY_MCP_SERVICE_ID`       | Variable | MCP service ID; `deploy-mcp` is skipped when unset            |
| `VERCEL_TOKEN`                 | Secret   | Vercel CLI auth for both Vercel deploy jobs                   |
| `VERCEL_ORG_ID`                | Secret   | Vercel org/team ID                                            |
| `VERCEL_PROJECT_ID`            | Secret   | Vercel project ID (notes frontend)                            |
| `VERCEL_PROJECT_ID_BACKOFFICE` | Secret   | Vercel project ID (`knowtis-backoffice`)                      |
| `ANTHROPIC_API_KEY`            | Secret   | Nightly AI eval (`nightly-eval.yml`); funded account required |
| `VOYAGE_API_KEY`               | Secret   | Optional — lights up the retrieval/memory eval suites         |
| `TAVILY_API_KEY`               | Secret   | Optional — lights up the web-search eval suite                |

> A third deploy job, `deploy-mcp`, ships the MCP server to Railway through the same gated script on `push` to `main` when the `mcp` app is affected and `RAILWAY_MCP_SERVICE_ID` is set.

### Frontend (Vercel) — CI-driven

Like the API, the frontend is deployed by the **CI pipeline**, not by Vercel's GitHub integration. `vercel.json` sets `"git": { "deploymentEnabled": false }`, so pushes never trigger a Vercel build directly.

```
Push to main → GitHub Actions CI → lint, typecheck, test, build → vercel pull/build/deploy --prebuilt --prod
```

The `deploy-frontend` job (`.github/workflows/ci.yml`) runs only on `push` to `main` and only when the `notes` app is affected (`needs.ci.outputs.notes_affected`). It installs the Vercel CLI and runs `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`.

Config: `vercel.json` at repo root.

### Backoffice (Vercel) — CI-driven

The admin backoffice deploys the same way through the `deploy-backoffice` job, gated on the `backoffice` app being affected. It targets a **separate Vercel project** (`knowtis-backoffice`, secret `VERCEL_PROJECT_ID_BACKOFFICE`) and passes `--local-config apps/backoffice/vercel.json` to both `vercel build` and `vercel deploy`.

- **Domain:** `backoffice.knowtis.app` — DNS is a manual CNAME at the registrar (Porkbun).
- **API CORS:** the API needs `BACKOFFICE_URL` set on Railway, alongside `FRONTEND_URL`.
- **Sessions:** each frontend gets its own refresh cookie (isolated per origin) — the backoffice never shares the notes app's session.

---

## Railway Configuration

### railway.toml

```toml
[build]
builder = "nixpacks"
# NODE_ENV=development so build-only devDependencies (nx, tsx) are installed.
buildCommand = "NODE_ENV=development pnpm install --frozen-lockfile && pnpm build:api"
watchPatterns = ["apps/api/**", "libs/**", "package.json", "pnpm-lock.yaml", "railway.toml"]

[deploy]
# Single source of truth for DB migrations; aborts the deploy on non-zero exit.
preDeployCommand = "pnpm exec tsx apps/api/src/database/migrate.ts"
startCommand = "node dist/apps/api/main.js"
healthcheckPath = "/api/v1/health/ping"
healthcheckTimeout = 120
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### Database Migrations (pre-deploy)

`preDeployCommand` runs Drizzle migrations in Railway's release phase — same `DATABASE_URL` and network as the app, before any new instance serves traffic. A non-zero exit **aborts the deploy**, so new code never runs against an un-migrated schema. `migrate.ts` takes a Postgres advisory lock, making it safe under concurrent deploys. This is the **only** migrator; CI does not run migrations. See [MIGRATIONS.md](MIGRATIONS.md).

### Environment Variables

| Variable                 | Required | Description                              |
| ------------------------ | -------- | ---------------------------------------- |
| `DATABASE_URL`           | Yes      | PostgreSQL connection string             |
| `REDIS_URL`              | No       | Redis connection (caching, sessions)     |
| `JWT_SECRET`             | Yes      | Access token signing key (min 32 chars)  |
| `JWT_REFRESH_SECRET`     | Yes      | Refresh token signing key (min 32 chars) |
| `JWT_EXPIRES_IN`         | No       | Access token TTL (default: `15m`)        |
| `JWT_REFRESH_EXPIRES_IN` | No       | Refresh token TTL (default: `7d`)        |
| `FRONTEND_URL`           | Yes      | Notes frontend URL for CORS              |
| `BACKOFFICE_URL`         | No       | Backoffice URL for CORS                  |
| `NODE_ENV`               | No       | Set by railway.toml (`production`)       |
| `PORT`                   | No       | Set by railway.toml (`3333`)             |

Use Railway reference variables for internal networking (free, faster):

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

Generate JWT secrets with:

```bash
openssl rand -hex 32
```

### Health Endpoints

| Endpoint               | Purpose                                |
| ---------------------- | -------------------------------------- |
| `/api/v1/health/ping`  | Liveness check (used by Railway)       |
| `/api/v1/health/ready` | Readiness check with feature flags     |
| `/api/v1/health`       | Full health status with memory metrics |

---

## Vercel Configuration

Set in Vercel Dashboard → Settings → Environment Variables:

```bash
VITE_API_URL=https://your-railway-domain.railway.app/api/v1
VITE_WS_URL=https://your-railway-domain.railway.app
VITE_COLLABORATION_MODE=websocket
```

---

## Initial Setup (from scratch)

1. Create a Railway project with PostgreSQL (and optionally Redis) services
2. Add the API service via `railway up` or link GitHub repo
3. Configure environment variables (see table above)
4. Generate a public domain: Settings → Networking → Public Networking
5. Set `FRONTEND_URL` in Railway to your Vercel URL
6. Set Vercel's `VITE_API_URL` to the Railway domain + `/api/v1`
7. Set up GitHub secrets/variables for CI deploys: `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID` (API), `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` (frontend), and optionally `RAILWAY_MCP_SERVICE_ID` (MCP) and `VERCEL_PROJECT_ID_BACKOFFICE` (backoffice)

---

## Troubleshooting

| Problem                  | Check                                                                    |
| ------------------------ | ------------------------------------------------------------------------ |
| Build fails              | Build logs in Railway, verify `pnpm-lock.yaml` committed                 |
| CORS errors              | `FRONTEND_URL` matches Vercel URL exactly (`https://`, no trailing `/`)  |
| WebSocket not connecting | `REDIS_URL` configured, frontend `VITE_WS_URL` correct                   |
| Database connection      | `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}` syntax                  |
| Deploy not triggering    | Check `RAILWAY_TOKEN` secret and `RAILWAY_SERVICE_ID` variable in GitHub |

---

## Quick Reference

```bash
# Generate JWT secrets
openssl rand -hex 32

# Test health
curl https://your-api.railway.app/api/v1/health/ping

# View logs (Railway CLI)
railway logs

# Manual deploy (bypassing CI)
railway up --service <SERVICE_ID>
```

## Official Docs

- [Railway Config as Code](https://docs.railway.com/guides/config-as-code)
- [Railway Private Networking](https://docs.railway.com/guides/private-networking)
- [Railway Variables Reference](https://docs.railway.com/reference/variables)
- [Vercel Vite Framework](https://vercel.com/docs/frameworks/frontend/vite)
