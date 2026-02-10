# Knowtis Deployment Guide

How Knowtis is deployed to production: Railway (backend) and Vercel (frontend).

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│     Vercel      │     │     Railway     │
│   (Frontend)    │────▶│   (Backend)     │
│  React + Vite   │     │    NestJS       │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
               ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
               │PostgreSQL│ │  Redis  │ │WebSocket│
               │(Railway) │ │(Railway)│ │(Socket.io)│
               └──────────┘ └─────────┘ └──────────┘
```

---

## How Deployments Work

### Backend (Railway) — CI-driven

Deployments are triggered by the **CI pipeline**, not by Railway's GitHub integration.

```
Push to main → GitHub Actions CI → lint, typecheck, test, build → railway up
```

The CI pipeline (`.github/workflows/ci.yml`) runs all checks first. Only after everything passes, the `deploy` job executes `railway up` using the Railway CLI container.

**Config files:**

| File                       | Purpose                           |
| -------------------------- | --------------------------------- |
| `railway.toml`             | Build/start commands, healthcheck |
| `.github/workflows/ci.yml` | CI pipeline with deploy step      |

**Required GitHub secrets/variables:**

| Name                 | Type     | Purpose                       |
| -------------------- | -------- | ----------------------------- |
| `RAILWAY_TOKEN`      | Secret   | Project token for Railway CLI |
| `RAILWAY_SERVICE_ID` | Variable | Service ID for `railway up`   |

### Frontend (Vercel) — Auto-deploy

Vercel auto-deploys on every push to `main`. No CI gate.

Config: `vercel.json` at repo root.

---

## Railway Configuration

### railway.toml

```toml
[build]
builder = "nixpacks"
buildCommand = "pnpm install --frozen-lockfile && pnpm build:api"
watchPatterns = ["apps/api/**", "libs/**", "package.json", "pnpm-lock.yaml"]

[deploy]
startCommand = "node dist/apps/api/main.js"
healthcheckPath = "/api/v1/health/ping"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### Environment Variables

| Variable                 | Required | Description                              |
| ------------------------ | -------- | ---------------------------------------- |
| `DATABASE_URL`           | Yes      | PostgreSQL connection string             |
| `REDIS_URL`              | No       | Redis connection (caching, sessions)     |
| `JWT_SECRET`             | Yes      | Access token signing key (min 32 chars)  |
| `JWT_REFRESH_SECRET`     | Yes      | Refresh token signing key (min 32 chars) |
| `JWT_EXPIRES_IN`         | No       | Access token TTL (default: `15m`)        |
| `JWT_REFRESH_EXPIRES_IN` | No       | Refresh token TTL (default: `7d`)        |
| `FRONTEND_URL`           | Yes      | Frontend URL for CORS                    |
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
7. Set up GitHub secrets (`RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID`) for CI deploys

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
