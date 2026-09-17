---
paths:
  - '.github/workflows/**'
  - '.github/scripts/**'
  - '.railway/**'
  - 'vercel.json'
  - 'apps/*/vercel.json'
  - 'apps/*/Dockerfile'
---

# CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)

Pipeline uses **Nx affected** to optimize builds and deploys. `nrwl/nx-set-shas@v5` picks the comparison commits.

1. **`ci` job** (runs against a `pgvector/pgvector:pg16` service): `pnpm skills:check` → `pnpm lint:config` → zizmor → `nx affected -t lint` → `nx affected -t typecheck` → migration drift check (`nx db:generate api` must leave `apps/api/drizzle/` clean) → `nx db:migrate:run api` → `nx affected -t test --parallel=2 -- --run` → `nx affected -t build --configuration=production` → sharing E2E when `notes-e2e` is affected. One `nx show projects --affected` step then exports `api_affected`, `notes_affected`, `mcp_affected`, `backoffice_affected`.
2. **Deploy jobs** (push to `main` only, each gated on its app being affected): `deploy-frontend` (Notes, Vercel), `deploy-backoffice` (Vercel, `--local-config=apps/backoffice/vercel.json`), `deploy` (API, Railway), `deploy-mcp` (Railway; also requires `vars.RAILWAY_MCP_SERVICE_ID` and passes an OAuth env-parity check between the api and mcp services before deploying).
3. **`build-images` job** (pull requests only, after `ci`): `docker build` of `apps/api/Dockerfile` and `apps/mcp/Dockerfile`, each gated on `api` / `mcp` being affected, so an image-only break fails the PR instead of the Railway deploy.

### Vercel (Frontend)

CI-driven, not Vercel Git auto-deploy: `vercel.json` sets `"git": { "deploymentEnabled": false }`, and the `deploy-frontend` job in `ci.yml` (gated on `notes` being affected, `main` push only) runs `vercel pull/build/deploy --prebuilt --prod`.

### Railway (Backend)

Deploy via `.github/scripts/railway-deploy.sh` in CI (detached `railway up`, then polling the deployment to a terminal status; `SKIPPED` and a 1500s timeout both fail the job), conditional on `api` (or `mcp`) being affected. Service configuration lives in `.railway/railway.ts` (Railway IaC) and is planned on PRs / applied on merge by `.github/workflows/railway-config.yml`; neither service declares `watchPatterns`. See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).

### Testing affected locally

```bash
pnpm nx show projects --affected --base=main --head=HEAD        # See affected projects
pnpm nx show projects --affected --type app --base=main --head=HEAD  # Apps only
pnpm nx affected -t lint typecheck test build --base=main --head=HEAD  # Simulate CI
```
