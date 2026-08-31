---
name: running-affected-ci
license: MIT
description: Simulates and interprets this repository's Nx-affected CI pipeline, including checks and deploy gating. Use before pushing, when asked which projects are affected, why a deploy job did or did not run, or to reproduce CI locally. Not for monitoring a running pipeline (use monitor-ci), generic Nx task usage (use nx-run-tasks), or deploy mechanics (use deploying).
---

# Running affected CI locally

The pipeline (`.github/workflows/ci.yml`) is **Nx-affected**: only impacted projects are linted, typechecked, tested, and built. `nrwl/nx-set-shas@v5` chooses comparison SHAs in CI; locally compare against `main`.

## Simulate CI

```bash
pnpm nx show projects --affected --base=main --head=HEAD
pnpm nx show projects --affected --type app --base=main --head=HEAD
pnpm nx affected -t lint typecheck --base=main --head=HEAD
pnpm nx db:migrate:run api
pnpm nx affected -t test --parallel=2 --outputStyle=stream --base=main --head=HEAD -- --run
pnpm nx affected -t build --configuration=production --base=main --head=HEAD
```

CI also runs `pnpm nx db:generate api` and rejects tracked or untracked changes under `apps/api/drizzle/`. Details: [references/ci-pipeline.md](references/ci-pipeline.md).

## Interpreting deploy gating

| Affected app | On push to main |
| --- | --- |
| `notes` | `deploy-frontend` runs (Vercel prebuilt) |
| `backoffice` | `deploy-backoffice` runs against its separate Vercel project |
| `api` | `deploy` runs through `.github/scripts/railway-deploy.sh` |
| `mcp` | `deploy-mcp` runs if `RAILWAY_MCP_SERVICE_ID` is set |

"CI didn't deploy X" usually means X wasn't affected by the diff — verify with the `--type app` command above.

## Local gates (Lefthook)

pre-commit: ESLint + Prettier on staged files + typecheck. pre-push: affected tests. commit-msg: Conventional Commits format. A CI failure that didn't fail locally is often a project you didn't have in your affected set — re-run with the exact base SHA CI used.
