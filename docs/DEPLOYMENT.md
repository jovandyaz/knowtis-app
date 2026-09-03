# Knowtis Deployment Guide

How Knowtis is deployed to production: Railway (API + MCP) and Vercel (notes frontend + backoffice).

## Architecture

```
┌─────────────────┐ ┌─────────────────┐     ┌──────────────────────────────────┐
│     Vercel      │ │     Vercel      │     │             Railway              │
│  Notes frontend │ │   Backoffice    │────▶│  API (NestJS) + MCP (Hono)       │
│  knowtis.app    │ │ backoffice.     │     │  HTTP /api/v1                    │
│                 │ │  knowtis.app    │     │  WS   /collaboration (Hocuspocus)│
└────────┬────────┘ └─────────────────┘     │  WS   /ai, /agent (Socket.io)    │
         └──────────────────────▶───────────┴────────────────┬─────────────────┘
                                                             │
                                                ┌────────────┴────────────┐
                                                │ PostgreSQL     Redis    │
                                                │ (Railway)      (Railway)│
                                                └─────────────────────────┘
```

---

## How Deployments Work

### Backend (Railway) — CI-driven

Deployments are triggered by the **CI pipeline**, not by Railway's GitHub integration.

```
Push to main → CI: skills:check, lint, typecheck, apply migrations, test, drift check, build → deploy → wait for SUCCESS
```

The CI pipeline (`.github/workflows/ci.yml`) runs all checks first. Only after everything passes, the `deploy` job runs `.github/scripts/railway-deploy.sh` in the Railway CLI container.

That script starts the deploy detached and then polls until the deployment reaches a terminal status. `SUCCESS` passes; the current gate also exits zero on `SKIPPED`, but that state means the new deployment did not become live and must not be described as deployment success. `FAILED`, `CRASHED`, `REMOVED`, a listing that never contains the deployment, or a 15-minute timeout fail the job. Agent automation must not trust an attached, non-TTY, `--ci`, or detached CLI return as terminal evidence: use `railway up --detach --json`, capture the exact deployment ID, and poll it to `SUCCESS`. `.github/workflows/deploy-gate.yml` runs `.github/scripts/railway-deploy.test.sh` on any change under `.github/scripts/`.

**Config files:**

| File                                 | Purpose                                                      |
| ------------------------------------ | ------------------------------------------------------------ |
| `railway.toml`                       | API build/start commands, healthcheck, pre-deploy migrations |
| `vercel.json`                        | Notes frontend: build, SPA rewrite, PostHog `/t/*` proxy     |
| `apps/backoffice/vercel.json`        | Backoffice: build, SPA rewrite                               |
| `.github/workflows/ci.yml`           | CI pipeline with the four deploy jobs                        |
| `.github/workflows/deploy-gate.yml`  | Tests the Railway deploy gate script whenever it changes     |
| `.github/workflows/nightly-eval.yml` | Scheduled AI eval run (no deploy)                            |

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

> A third deploy job, `deploy-mcp`, ships the MCP server to Railway through the same gated script on `push` to `main` when the `mcp` app is affected and `RAILWAY_MCP_SERVICE_ID` is set. Before deploying it pins `NODE_ENV` and `MCP_ALLOWED_HOSTS` on the MCP service and asserts OAuth env parity between the two services (see [OAuth variables](#oauth-variables-api-and-mcp)).

> `nightly-eval.yml` pins `AI_EVAL_TRIALS=3` (so a case is judged on its pass rate rather than one stochastic trial), sets `AI_EVAL_OUTPUT_DIR` to a workspace directory, and uploads it as the `eval-results` artifact with a 90-day retention — that artifact is the only historical record of eval runs.

### Frontend (Vercel) — CI-driven

Like the API, the frontend is deployed by the **CI pipeline**, not by Vercel's GitHub integration. `vercel.json` sets `"git": { "deploymentEnabled": false }`, so pushes never trigger a Vercel build directly.

```
Push to main → CI (same checks as above) → vercel pull/build/deploy --prebuilt --prod
```

The `deploy-frontend` job (`.github/workflows/ci.yml`) runs only on `push` to `main` and only when the `notes` app is affected (`needs.ci.outputs.notes_affected`). It installs the Vercel CLI and runs `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`.

Config: `vercel.json` at repo root. Besides the SPA fallback it rewrites `/t/static/*` and `/t/*` to PostHog's US ingestion hosts, which is why the frontend's PostHog `api_host` defaults to `/t`.

### Backoffice (Vercel) — CI-driven

The admin backoffice deploys the same way through the `deploy-backoffice` job, gated on the `backoffice` app being affected. It targets a **separate Vercel project** (`knowtis-backoffice`, secret `VERCEL_PROJECT_ID_BACKOFFICE`) and passes `--local-config apps/backoffice/vercel.json` to both `vercel build` and `vercel deploy`.

- **Domain:** `backoffice.knowtis.app` — DNS is a manual CNAME at the registrar (Porkbun).
- **API CORS and cookies:** the API requires `BACKOFFICE_URL` in production (`env.config.ts` refuses to boot without it), alongside `FRONTEND_URL`.
- **Sessions:** each frontend gets its own refresh cookie (`rid` vs `rid_bo`) — the backoffice never shares the notes app's session.

---

## Railway Configuration

### railway.toml

[`railway.toml`](../railway.toml) is the API service's config-as-code: nixpacks builder, `pnpm install --frozen-lockfile && pnpm build:api` (with `NODE_ENV=development` so build-time devDependencies install), `node dist/apps/api/main.js` as start command, `/api/v1/health/ping` as healthcheck, `ON_FAILURE` restart with 3 retries, and the pre-deploy migration command below. Read the file rather than a copy here.

`watchPatterns` is evaluated by Railway against the uploaded snapshot even though CI already gated on Nx affected; a snapshot matching none of the patterns records a `SKIPPED` deployment. At the time of writing the patterns cover `apps/api/**`, `libs/**`, `package.json`, `pnpm-lock.yaml`, and `railway.toml` but **not `packages/**`**, although the API depends on several `packages/\*`workspace packages — a change confined to`packages/` can therefore be skipped by Railway. This is being fixed separately; check the file for the current list.

### Database Migrations (pre-deploy)

`preDeployCommand` runs Drizzle migrations in Railway's release phase — same `DATABASE_URL` and network as the app, before any new instance serves traffic. A non-zero exit **aborts the deploy**, so new code never runs against an un-migrated schema. `migrate.ts` takes a Postgres advisory lock, making it safe under concurrent deploys. This is the only **production** migrator; CI applies the same committed migrations only to its disposable test database. See [MIGRATIONS.md](MIGRATIONS.md).

### Environment Variables

`apps/api/.env.example` is the source of truth for names and comments. The ones that matter for a production deploy:

| Variable                       | Required                     | Description                                                                                                                                                           |
| ------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Yes                          | PostgreSQL connection string                                                                                                                                          |
| `REDIS_URL`                    | Yes in production            | Redis for AI rate limiting/cache, agent HITL proposals, and Hocuspocus multi-instance sync. The schema default is `redis://localhost:6379`, so production must set it |
| `JWT_SECRET`                   | Yes                          | Access token signing key (min 32 chars); must differ from `JWT_REFRESH_SECRET`; placeholder-looking values are rejected in production                                 |
| `JWT_REFRESH_SECRET`           | Yes                          | Refresh token signing key (min 32 chars)                                                                                                                              |
| `TOKEN_HASH_KEY`               | Yes                          | HMAC key for every stored token hash. 32 bytes, base64. See [TOKEN_HASH_KEY](#token_hash_key)                                                                         |
| `BCRYPT_ROUNDS`                | No (default `12`)            | bcrypt cost factor, 10–15                                                                                                                                             |
| `JWT_EXPIRES_IN`               | No (default `15m`)           | Access token TTL                                                                                                                                                      |
| `JWT_REFRESH_EXPIRES_IN`       | No (default `7d`)            | Refresh token TTL                                                                                                                                                     |
| `FRONTEND_URL`                 | Yes                          | Notes frontend origin for CORS                                                                                                                                        |
| `BACKOFFICE_URL`               | Yes in production            | Backoffice origin for CORS and its own refresh cookie; `env.config.ts` fails validation without it when `NODE_ENV=production`                                         |
| `EMAIL_PROVIDER`               | No (default `console`)       | `resend` in production                                                                                                                                                |
| `RESEND_API_KEY`               | When `EMAIL_PROVIDER=resend` | Resend API key                                                                                                                                                        |
| `EMAIL_FROM`                   | No                           | Sender address                                                                                                                                                        |
| `VERCEL_BLOB_READ_WRITE_TOKEN` | For image uploads            | Vercel Blob store token used by `VercelBlobStorage`                                                                                                                   |
| `NODE_ENV`                     | No                           | Set by `railway.toml` (`production`)                                                                                                                                  |
| `PORT`                         | No                           | Set by `railway.toml` (`3333`)                                                                                                                                        |

AI variables (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `BYOK_ENCRYPTION_KEY`, budgets, alert webhook, Langfuse, Voyage, Tavily, …) are documented in [AI.md → Environment Variables](AI.md#environment-variables).

#### OAuth variables (API and MCP)

The OAuth 2.1 authorization server for MCP clients is armed by four all-or-nothing variables on the API service — `OAUTH_ISSUER`, `OAUTH_JWKS`, `OAUTH_COOKIE_KEYS`, `MCP_RESOURCE_URL` — and two on the MCP service — `MCP_OAUTH_ISSUER`, `MCP_RESOURCE_URL`. The `deploy-mcp` job reads both services' variables and fails the deploy when `MCP_OAUTH_ISSUER != OAUTH_ISSUER`, when the two `MCP_RESOURCE_URL` values differ, or when any of them has a trailing slash (they are used verbatim as JWT `iss`/`aud`). Setup and local values: [MCP.md](MCP.md).

Use Railway reference variables for internal networking:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

#### Generating secrets

```bash
openssl rand -hex 32      # JWT_SECRET, JWT_REFRESH_SECRET (use different values)
openssl rand -base64 32   # TOKEN_HASH_KEY, BYOK_ENCRYPTION_KEY — must decode to exactly 32 bytes
```

#### TOKEN_HASH_KEY

`AuthModule` reads `TOKEN_HASH_KEY` with `getOrThrow` while it is being constructed, so a missing or malformed key fails NestJS dependency injection at boot — in every environment, not only production. Set it before the next deploy.

**The first deploy that sets it is a global forced logout**, not only a later rotation. Every stored hash — `sessions.refreshTokenHash`, password-reset tokens, email-verification link tokens and codes — was written under a different scheme, so none of them match once the key is in play: every user is signed out and every outstanding reset and verification link stops working. Rotating the key later does exactly the same thing. Plan it like a session wipe: ship it in a low-traffic window and expect a login spike plus "my reset link is broken" reports.

### Health Endpoints

`apps/api/src/modules/health/health.controller.ts`:

| Endpoint               | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `/api/v1/health/ping`  | Liveness (`{ status: 'ok', timestamp }`); Railway healthcheck |
| `/api/v1/health/ready` | Readiness: database connectivity only; 503 when unreachable   |
| `/api/v1/health`       | Terminus memory heap/RSS indicators                           |

---

## Vercel Configuration

Set in Vercel Dashboard → Settings → Environment Variables (names from `apps/notes/.env.example`):

```bash
VITE_API_URL=https://<api-domain>/api/v1
VITE_WS_URL=https://<api-domain>          # frontend appends /collaboration
VITE_COLLABORATION_MODE=websocket         # required: any other value keeps the editor local-only
VITE_MCP_URL=https://mcp.knowtis.app/mcp  # shown in Settings > Integrations; defaults to this when unset
VITE_PUBLIC_POSTHOG_KEY=                  # empty disables analytics
VITE_PUBLIC_POSTHOG_HOST=                 # leave empty to use the /t proxy from vercel.json
```

`isWebSocketEnabled()` (`apps/notes/src/collaboration/useHocuspocusCollaboration.ts`) opens the Hocuspocus connection only for `websocket` or `hybrid`.

The backoffice project needs `VITE_API_URL` only (`apps/backoffice/.env.example`).

---

## Initial Setup (from scratch)

1. Create a Railway project with PostgreSQL (pgvector image) and Redis services
2. Add the API service via `railway up` or link the GitHub repo
3. Configure environment variables (see table above)
4. Generate a public domain: Settings → Networking → Public Networking
5. Set `FRONTEND_URL` and `BACKOFFICE_URL` in Railway to the Vercel URLs
6. Set Vercel's `VITE_API_URL` to the Railway domain + `/api/v1`
7. Set up GitHub secrets/variables for CI deploys: `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID` (API), `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` (frontend), and optionally `RAILWAY_MCP_SERVICE_ID` (MCP) and `VERCEL_PROJECT_ID_BACKOFFICE` (backoffice)

---

## Feature Flag Rollouts

AI-domain flags are rolled out from the backoffice **AI Config** page rather than the Feature Flags page, and each one's prerequisites (`agent_health_alerts` needs `AI_ALERT_WEBHOOK_URL`, `ai_tier_gating` changes who may run which model, `ai_catalog_sync` starts the daily OpenRouter sync) are documented in [AI.md → Feature Flags (DB-backed)](AI.md#feature-flags-db-backed).

### Email verification gate (`email_verification_gate`)

Seeded `false` by migration `0037`. While off, `VerifiedIdentityPolicy` allows everyone and the app only nudges — the banner shows for every unverified account regardless of the flag, so accounts verify before enforcement. On, a verified non-anonymous account is required to open a note to anyone with the link, give link holders edit rights, create MCP API keys, store BYOK provider keys and approve a copilot share proposal (`403 EMAIL_NOT_VERIFIED`, see [PERMISSIONS.md](PERMISSIONS.md#verified-identity-gate)).

1. **Prerequisites:** `TOKEN_HASH_KEY` set on Railway and a frontend build that ships the banner and the in-place dialog.
2. **Give accounts time.** The banner is live as soon as that frontend deploys; flip only after the verification rate has moved — `auth.email.verified` events in the audit log, by `source`.
3. **Flip it** in the backoffice (**Feature flags** → `email_verification_gate`). The API caches flags in-process for 30 seconds; the banner copy switches to "what verification unlocks" on the next `/flags` read.
4. **Expect the deliberate side effect:** `isVerified()` also refuses anonymous accounts, so **anonymous visitors lose link-sharing at once** and are pointed at creating an account.
5. **Rollback** is the same switch: nothing is persisted on the way, and the policy allows again within 30 seconds.

---

## Troubleshooting

| Problem                  | Check                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Build fails              | Build logs in Railway, verify `pnpm-lock.yaml` committed                                                                        |
| CORS errors              | `FRONTEND_URL` / `BACKOFFICE_URL` match the Vercel URLs exactly (`https://`, no trailing `/`)                                   |
| WebSocket not connecting | Frontend `VITE_WS_URL` correct and `VITE_COLLABORATION_MODE=websocket`; `REDIS_URL` set if more than one API instance runs      |
| Database connection      | `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}` syntax                                                                         |
| Deploy not triggering    | Check `RAILWAY_TOKEN` secret and `RAILWAY_SERVICE_ID` variable in GitHub; a `SKIPPED` deployment means no `watchPatterns` match |
| API crashes on boot      | `TOKEN_HASH_KEY` present and valid; `BACKOFFICE_URL` set when `NODE_ENV=production` (see [TOKEN_HASH_KEY](#token_hash_key))     |
| OAuth tokens rejected    | `deploy-mcp` parity check output: issuer/resource URL drift or trailing slash                                                   |

---

## Quick Reference

```bash
# Test health
curl https://<api-domain>/api/v1/health/ping

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
