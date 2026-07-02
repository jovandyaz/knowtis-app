---
name: deploying-knowtis
description: Explains and troubleshoots Knowtis deployments — CI-driven Vercel (frontend) and Railway (API/MCP) deploys, environment variables, health checks, and common failure modes. Use when asked "deploy", "por qué no se desplegó", "release", when a deploy fails or hangs, or when configuring Railway/Vercel env vars. Not for simulating which jobs will fire (use running-affected-ci) or for DB migrations (use db-ops).
---

# Deploying Knowtis

Both deploy targets are **CI-driven from GitHub Actions** — neither Vercel's nor Railway's Git integrations are active. Full runbook: [references/deployment.md](references/deployment.md).

## Mental model

```
push to main → CI (nx affected: lint/test/build + typecheck)
   ├─ notes affected → vercel pull/build/deploy --prebuilt --prod
   ├─ api affected   → railway up  (pre-deploy: migrations, abort on failure)
   └─ mcp affected   → railway up  (if RAILWAY_MCP_SERVICE_ID set)
```

## The facts that resolve most deploy confusion

1. **Vercel never deploys on push by itself** — `vercel.json` disables Git deployments. If the frontend didn't update, check whether `notes` was affected and whether `deploy-frontend` ran.
2. **Railway `watchPatterns` do nothing** — deploys come from `railway up` in CI, not Railway's repo watching.
3. **Migrations run in Railway's release phase**, not CI. A failed migration aborts the deploy — the app never boots on an un-migrated schema. Check the pre-deploy logs first when a Railway deploy fails after build.
4. **Healthcheck gate**: Railway waits on `/api/v1/health/ping` (timeout 120s). A deploy that builds but never goes live usually fails here — check boot logs for missing env vars (Zod validates at startup and refuses to boot).
5. **Manual escape hatch**: `railway up --service <SERVICE_ID>` deploys bypassing CI — use only for emergencies, never as the routine path.

## Troubleshooting quick table

| Symptom | First check |
| --- | --- |
| Build fails | Railway build logs; `pnpm-lock.yaml` committed? |
| CORS errors | `FRONTEND_URL` exactly matches the Vercel URL (https, no trailing `/`) |
| WebSocket not connecting | `REDIS_URL` set; frontend `VITE_WS_URL` correct |
| Deploy not triggering | Was the app affected? `RAILWAY_TOKEN` / `RAILWAY_SERVICE_ID` present? |
| App boots then 500s on AI routes | `ANTHROPIC_API_KEY` and DB feature flags |
