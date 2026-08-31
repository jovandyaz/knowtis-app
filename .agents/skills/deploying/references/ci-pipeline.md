# CI pipeline detail

Canonical sources: `.github/workflows/ci.yml` and the CI/CD section of `CLAUDE.md` in the Knowtis repository.

## Stages

1. **Vendored skills** — verify every managed skill against its ownership manifest.
2. **Affected checks** — lint and typecheck the impacted projects.
3. **Test database** — apply committed migrations to CI's disposable Postgres database before tests.
4. **Affected tests** — run with bounded parallelism and streamed output.
5. **Migration drift** — generate from the schema and use porcelain status to fail on tracked or untracked changes under `apps/api/drizzle/`.
6. **Production builds** — build affected projects with the production configuration.
7. **Conditional deploys** (push to `main` only):
   - `deploy-frontend` — gated on `notes` affected. Vercel CLI: `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`.
   - `deploy-backoffice` — gated on `backoffice` affected and targets `VERCEL_PROJECT_ID_BACKOFFICE`.
   - `deploy` — gated on `api` affected and calls `.github/scripts/railway-deploy.sh`.
   - `deploy-mcp` — gated on `mcp` affected and `RAILWAY_MCP_SERVICE_ID` being set; it also verifies OAuth variable parity.
8. **SHA detection** — `nrwl/nx-set-shas@v5` computes base/head for `affected`; pull requests can target `main`, `develop`, or a supported stacked-branch prefix.

## Required secrets and variables

| Name | Type | Purpose |
| --- | --- | --- |
| `RAILWAY_TOKEN` | Secret | Railway CLI auth for API and MCP deploys |
| `RAILWAY_SERVICE_ID` | Variable | API service target |
| `RAILWAY_MCP_SERVICE_ID` | Variable | MCP service target; job skipped when unset |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Secrets | Notes deploy |
| `VERCEL_PROJECT_ID_BACKOFFICE` | Secret | Backoffice deploy |

## Key facts

- Vercel Git integration is off; pushes never trigger Vercel directly.
- `railway up` uploads the snapshot, but Railway can skip the build when `watchPatterns` match no changed files. Explicit `railway up --ci` exits 0 on that message and detached mode records `SKIPPED`; compare either result with Nx's affected set before deciding nothing needed deployment. Agent automation must verify the exact deployment ID because non-TTY invocations can return before terminal status.
- CI applies migrations only to its disposable test database. Railway's pre-deploy command is the only production migrator.
