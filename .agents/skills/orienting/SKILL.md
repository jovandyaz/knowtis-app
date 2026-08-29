---
name: orienting
description: Orients architecture work in this Knowtis monorepo, including ownership, aliases, module boundaries, the two AI modules, and known framework footguns. Use when locating a subsystem, deciding where code belongs, reviewing architecture, or diagnosing a NestJS provider that is unexpectedly undefined. For generic Nx exploration use nx-workspace; for scaffolding use nx-generate. Not for copilot or collaboration internals.
---

# Orienting in Knowtis

Knowtis is a real-time collaborative notes platform: Nx monorepo, pnpm, Node 22. React 19 + Vite frontend, NestJS 11 backend, PostgreSQL 16 + Drizzle, Redis, Yjs/Hocuspocus CRDT collaboration, Vercel AI SDK v6.

For the full layout and dependency rules load [references/architecture-map.md](references/architecture-map.md). For Nx tags/boundaries and the dual alias namespaces load [references/aliases-and-boundaries.md](references/aliases-and-boundaries.md).

## The five facts that prevent most wasted sessions

1. **There are TWO AI modules.** `apps/api/src/modules/ai` = single-shot AI features (inline assistant). `apps/api/src/modules/agent` = the conversational copilot (tool loop, HITL, threads). Both sit on the framework-free `@knowtis/ai-gateway` package. Don't add copilot features to `ai` or vice versa.
2. **Two alias namespaces.** 18 workspace entries import as `@knowtis/*`; publishable auth/permissions/email packages import as `@jovandyaz/*`. There is no `@knowtis/auth` — that import will not resolve.
3. **The `import type` DI footgun.** In `apps/api/**`, `import type` on a constructor-injected class silently breaks NestJS DI (provider arrives `undefined`). ESLint auto-fix is disabled there for this reason.
4. **Migrations: `generate` + `migrate`, never `push`.** Schema lives in `apps/api/src/database/schema/`; `pnpm db:generate` produces the migration; Railway's pre-deploy command is the only production migrator. `drizzle-kit push` against shared DBs causes the schema drift that migrations were adopted to fix.
5. **Deploys are CI-driven, not Git-integration-driven.** Notes and backoffice deploy to separate Vercel projects; API and MCP deploy through `.github/scripts/railway-deploy.sh`. Railway `watchPatterns` are inert.

## Working rules

- Everything runs through Nx: `pnpm nx affected -t lint test build`, `nx run <project> <target>`. Always `pnpm`, never npm/yarn.
- Module boundaries are ESLint-enforced via tags (`type:app → type:ui/data-access → type:util`; scopes `shared|notes|api`). A new lib needs correct tags or imports will be rejected.
- AI features are gated: `ANTHROPIC_API_KEY` in env AND DB feature flags (`ai_enabled`, `agent_byok`, …) toggled on. A feature "not working" is often just a flag defaulting to off.
- Repo docs are canonical: `docs/ARCHITECTURE.md`, `docs/AI.md`, `docs/MCP.md`, `docs/AUTH.md`, `docs/PERMISSIONS.md`, `docs/MIGRATIONS.md`, `docs/DEPLOYMENT.md`. The dated design specs under `docs/superpowers/specs/` are rationale/history — never treat them as current behavior.
