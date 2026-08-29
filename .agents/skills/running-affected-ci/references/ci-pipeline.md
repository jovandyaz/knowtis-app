# CI pipeline detail

Canonical sources: `.github/workflows/ci.yml` and the CI/CD section of `CLAUDE.md` in the knowtis repo.

## Stages

1. **Affected checks** — lint and typecheck the impacted projects.
2. **Test database** — apply committed migrations before tests.
3. **Affected tests** — run with bounded parallelism and streamed output.
4. **Migration drift** — generate from the schema and use porcelain status to fail on tracked or untracked changes under `apps/api/drizzle/`.
5. **Production builds** — build affected projects with the production configuration.
6. **Conditional deploys** (push to `main` only):
   - `deploy-frontend` — gated on `notes` affected. Vercel CLI: `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`.
   - `deploy-backoffice` — gated on `backoffice` affected and targets `VERCEL_PROJECT_ID_BACKOFFICE`.
   - `deploy` — gated on `api` affected and calls `.github/scripts/railway-deploy.sh`.
   - `deploy-mcp` — gated on `mcp` affected and `RAILWAY_MCP_SERVICE_ID` being set; it also verifies OAuth variable parity.
7. **SHA detection** — `nrwl/nx-set-shas@v5` computes base/head for `affected`.

## Required secrets/variables

| Name | Type | Purpose |
| --- | --- | --- |
| `RAILWAY_TOKEN` | Secret | Railway CLI auth (API + MCP deploys) |
| `RAILWAY_SERVICE_ID` | Variable | API service target |
| `RAILWAY_MCP_SERVICE_ID` | Variable | MCP service target (job skipped when unset) |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Secrets | Notes deploy |
| `VERCEL_PROJECT_ID_BACKOFFICE` | Secret | Backoffice deploy |

## Key facts

- Vercel Git integration is OFF (`vercel.json`: `"git": { "deploymentEnabled": false }`) — pushes never trigger Vercel directly.
- Railway `watchPatterns` are inert (deploys are CI-driven, not Railway-GitHub-integration-driven).
- CI applies migrations only to its disposable test database. Railway's pre-deploy command is the only production migrator.
