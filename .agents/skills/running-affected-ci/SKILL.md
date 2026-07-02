---
name: running-affected-ci
description: Simulates and interprets the Knowtis CI pipeline locally using nx affected — which projects a change touches, which checks will run, and which deploy jobs will fire. Use before pushing, when asked "will this pass CI", "qué proyectos afecta", "why did CI deploy/not deploy", or to reproduce a CI failure locally. Not for the deploy mechanics themselves (use deploying-knowtis).
---

# Running affected CI locally

The pipeline (`.github/workflows/ci.yml`) is **Nx-affected**: only impacted projects are linted/tested/built, and deploy jobs are gated on which apps were affected. `nrwl/nx-set-shas@v4` picks the comparison SHAs in CI; locally you compare against `main`.

## Simulate CI

```bash
npx nx show projects --affected --base=main --head=HEAD        # what's affected
npx nx show projects --affected --type app --base=main --head=HEAD  # apps only
npx nx affected -t lint test build --base=main --head=HEAD     # the CI job itself
npx tsc --noEmit                                               # global typecheck (CI runs it workspace-wide)
```

Prefix nx with `pnpm` (`pnpm nx …`) to use the workspace CLI. Details of each pipeline stage: [references/ci-pipeline.md](references/ci-pipeline.md).

## Interpreting deploy gating

| Affected app | On push to main |
| --- | --- |
| `notes` | `deploy-frontend` runs (Vercel prebuilt) |
| `api` | `deploy` runs (`railway up`) |
| `mcp` | `deploy-mcp` runs if `RAILWAY_MCP_SERVICE_ID` is set |

"CI didn't deploy X" usually means X wasn't affected by the diff — verify with the `--type app` command above.

## Local gates (Lefthook)

pre-commit: ESLint + Prettier on staged files + typecheck. pre-push: affected tests. commit-msg: Conventional Commits format. A CI failure that didn't fail locally is often a project you didn't have in your affected set — re-run with the exact base SHA CI used.
