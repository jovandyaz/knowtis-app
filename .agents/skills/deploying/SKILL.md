---
name: deploying
license: MIT
description: Diagnoses and verifies Knowtis delivery from local Nx checks through CI-driven Vercel and Railway deploys. Use when asked what a change affects, to reproduce CI, run a full preflight or readiness check, explain why a deploy did not trigger, troubleshoot a failed or hanging deploy, or configure deployment environments. Covers lint, typecheck, tests, builds, migration drift, deploy gates, health checks, and terminal status. Not for changing the database schema (use managing-drizzle-migrations).
---

# Diagnosing CI and deploying Knowtis

All deploy targets are **CI-driven from GitHub Actions**. Neither Vercel's nor Railway's Git integrations are active. Use [references/ci-pipeline.md](references/ci-pipeline.md) for affected checks and [references/deployment.md](references/deployment.md) for runtime topology and configuration.

## Mental model

```
push to main → affected lint/typecheck/test/build + migration drift check
   ├─ notes affected      → Vercel notes project
   ├─ backoffice affected → Vercel backoffice project
   ├─ api affected        → railway-deploy.sh (waits for terminal status)
   └─ mcp affected        → railway-deploy.sh (if RAILWAY_MCP_SERVICE_ID is set)
```

## The facts that resolve most deploy confusion

1. **Vercel never deploys directly from a push** — Git deployments are disabled. Check the affected app and its corresponding `deploy-frontend` or `deploy-backoffice` job.
2. **`railway up` uploads the snapshot, then Railway can skip its build via `watchPatterns`.** Explicit `railway up --ci` exits 0 when build logs say “No changed files matched patterns”; a detached deployment may later become `SKIPPED`, observable by polling its exact ID. Compare that state with the Nx affected set and never report it as a successful deployment. The API patterns currently omit `packages/**`, so package-only transitive changes require particular scrutiny.
3. **Production migrations run in Railway's release phase.** CI applies migrations only to its test database and separately checks generated migration drift.
4. **CLI return is not sufficient evidence in agent automation.** A non-TTY invocation can return after upload, explicit `--ci` has a watch-pattern early-success path, and `--detach` only queues work. Use `railway up --detach --json`, capture that exact deployment ID, and poll it to `SUCCESS`; a healthy endpoint alone may still be the previous deployment.
5. **Healthcheck gates differ by service**: API uses `/api/v1/health/ping` with 120 seconds; MCP uses `/health` with 60 seconds. Check the matching service configuration when a build succeeds but never becomes live.
6. **Manual escape hatch**: direct Railway deploys bypass CI and are for explicit emergencies only. Prefer the repository's gated deploy script; otherwise use `railway up --detach --json`, poll the returned deployment ID to `SUCCESS`, then verify the service health endpoint before reporting completion.

## Local CI and readiness

When asked what is affected, to reproduce CI, or to run preflight, resolve the actual target branch first. For a stacked PR, use its parent branch rather than `main`; when reproducing a CI run, use that run's exact base SHA.

```bash
if [ -z "${BASE_SHA:-}" ]; then
  BASE_REF="${BASE_REF:?Set the PR target branch, such as origin/main or origin/feat/parent}"
  BASE_SHA="$(git merge-base HEAD "$BASE_REF")"
fi
HEAD_SHA="${HEAD_SHA:-$(git rev-parse HEAD)}"
if [ "$BASE_SHA" = "$HEAD_SHA" ] && [ "${ALLOW_EMPTY_AFFECTED:-false}" != "true" ]; then
  echo "BASE_SHA equals HEAD_SHA; set the exact CI SHAs or explicitly allow an empty comparison." >&2
  exit 1
fi

pnpm skills:check
pnpm nx show projects --affected --base="$BASE_SHA" --head="$HEAD_SHA"
pnpm nx show projects --affected --type app --base="$BASE_SHA" --head="$HEAD_SHA"
pnpm nx affected -t lint typecheck --base="$BASE_SHA" --head="$HEAD_SHA"

if [ -n "${DISPOSABLE_DATABASE_URL:-}" ]; then
  DATABASE_URL="$DISPOSABLE_DATABASE_URL" pnpm nx db:migrate:run api
  DATABASE_URL="$DISPOSABLE_DATABASE_URL" pnpm nx affected -t test --parallel=2 --outputStyle=stream --base="$BASE_SHA" --head="$HEAD_SHA" -- --run
else
  pnpm nx affected -t test --exclude=api --parallel=2 --outputStyle=stream --base="$BASE_SHA" --head="$HEAD_SHA" -- --run
fi
pnpm nx db:generate api
test -z "$(git status --porcelain --untracked-files=all -- apps/api/drizzle/)"
pnpm nx affected -t build --configuration=production --base="$BASE_SHA" --head="$HEAD_SHA"
```

Use `pnpm nx` consistently. When reproducing a CI run, set its exact `BASE_SHA` and `HEAD_SHA`; reject an equal pair for a run known to contain changes. `DISPOSABLE_DATABASE_URL` must identify a fresh PostgreSQL 16 database with pgvector available, equivalent to the CI `pgvector/pgvector:pg16` service. Never source it from `.env`, and never run migrations or database-backed tests against shared dev, staging, or production data. Without a proven disposable database, continue non-API affected tests with `--exclude=api` and report migration plus the API test target as blocked. A migration generated by `db:generate` is a failure until its SQL and metadata are reviewed and committed.

Execute every safe, applicable gate and collect all failures. End an explicit readiness request with **SHIP** only when every gate succeeds; otherwise return **NO-SHIP**, list every failed or blocked command with its first relevant error lines, and order remediation as skill drift, lint, types, test DB migration, tests, migration drift, then build.

Affected applications determine the deploy jobs on a push to `main`: `notes` → Vercel frontend, `backoffice` → its separate Vercel project, `api` → Railway API, and `mcp` → Railway MCP when its service ID is configured.

## Troubleshooting quick table

| Symptom | First check |
| --- | --- |
| Notes/backoffice build fails | Matching Vercel deployment job and build logs |
| API/MCP build fails | Railway build logs; `pnpm-lock.yaml` committed? |
| CORS errors | `FRONTEND_URL` and `BACKOFFICE_URL` exactly match their Vercel origins |
| WebSocket not connecting | Check `VITE_WS_URL`, `/collaboration`, and auth first; check `REDIS_URL` only for cross-replica fan-out |
| API does not boot | `TOKEN_HASH_KEY`, JWT secrets, and required URLs are present |
| Deploy not triggering | Was the app affected and is the target service/project variable configured? |
| App boots then 500s on AI routes | `ANTHROPIC_API_KEY` and DB feature flags |
