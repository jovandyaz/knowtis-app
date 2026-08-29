---
name: deploying
description: Explains and troubleshoots this repository's CI-driven Vercel and Railway deployments, including notes, backoffice, API, MCP, environment variables, health checks, and failure modes. Use when asked to deploy Knowtis, when a deploy fails or hangs, or when configuring its Railway/Vercel environments. Not for predicting affected jobs (use running-affected-ci) or changing the database schema (use managing-drizzle-migrations).
---

# Deploying Knowtis

All deploy targets are **CI-driven from GitHub Actions**. Neither Vercel's nor Railway's Git integrations are active. Full runbook: [references/deployment.md](references/deployment.md).

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
2. **Railway `watchPatterns` do nothing for these deploys** — CI invokes `.github/scripts/railway-deploy.sh` with an explicit service ID.
3. **Production migrations run in Railway's release phase.** CI applies migrations only to its test database and separately checks generated migration drift.
4. **The Railway script waits for a terminal deployment state.** Plain `railway up` returning is not proof that pre-deploy migrations and health checks passed.
5. **Healthcheck gate**: Railway waits on `/api/v1/health/ping` for up to 120 seconds. Check startup configuration when a build succeeds but never becomes live.
6. **Manual escape hatch**: direct Railway deploys bypass CI and are for explicit emergencies only.

## Troubleshooting quick table

| Symptom                          | First check                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| Build fails                      | Railway build logs; `pnpm-lock.yaml` committed?                             |
| CORS errors                      | `FRONTEND_URL` and `BACKOFFICE_URL` exactly match their Vercel origins      |
| WebSocket not connecting         | `REDIS_URL` set; frontend `VITE_WS_URL` correct                             |
| API does not boot                | `TOKEN_HASH_KEY`, JWT secrets, and required URLs are present                |
| Deploy not triggering            | Was the app affected and is the target service/project variable configured? |
| App boots then 500s on AI routes | `ANTHROPIC_API_KEY` and DB feature flags                                    |
