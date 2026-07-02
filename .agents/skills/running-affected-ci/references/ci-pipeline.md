# CI pipeline detail

Canonical sources: `.github/workflows/ci.yml` and the CI/CD section of `CLAUDE.md` in the knowtis repo.

## Stages

1. **CI job** — `nx affected -t lint test build` over the impacted projects only.
2. **Global typecheck** — `tsc --noEmit` across the whole workspace (not affected-scoped).
3. **Conditional deploys** (push to `main` only):
   - `deploy-frontend` — gated on `notes` affected. Vercel CLI: `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`.
   - `deploy` — gated on `api` affected. `railway up` via the Railway CLI container.
   - `deploy-mcp` — gated on `mcp` affected AND `RAILWAY_MCP_SERVICE_ID` set.
4. **SHA detection** — `nrwl/nx-set-shas@v4` computes base/head for `affected`.

## Required secrets/variables

| Name | Type | Purpose |
| --- | --- | --- |
| `RAILWAY_TOKEN` | Secret | Railway CLI auth (API + MCP deploys) |
| `RAILWAY_SERVICE_ID` | Variable | API service target |
| `RAILWAY_MCP_SERVICE_ID` | Variable | MCP service target (job skipped when unset) |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Secrets | Frontend deploy |

## Key facts

- Vercel Git integration is OFF (`vercel.json`: `"git": { "deploymentEnabled": false }`) — pushes never trigger Vercel directly.
- Railway `watchPatterns` are inert (deploys are CI-driven, not Railway-GitHub-integration-driven).
- CI does NOT run DB migrations — Railway's pre-deploy command does (see db-ops plugin).
