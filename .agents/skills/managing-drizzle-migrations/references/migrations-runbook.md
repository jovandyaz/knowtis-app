# Migrations runbook

Canonical source: `docs/MIGRATIONS.md` in the knowtis repo (re-sync this file when it changes).

## Commands

| Command | Effect |
| --- | --- |
| `pnpm db:generate` | Diff schema files → new `apps/api/drizzle/NNNN_*.sql` + meta snapshot |
| `pnpm db:migrate:run` | Programmatic `migrate()` against `$DATABASE_URL` (same code path as deploy) |
| `pnpm db:migrate` | Raw `drizzle-kit migrate` (works once the DB is tracked) |
| `pnpm db:baseline [tag]` | One-time bootstrap for a previously push-managed DB — records migrations as applied (idempotent, exact hashes via `readMigrationFiles`) |
| `pnpm db:studio` | Drizzle Studio GUI |

## Deploy-time application (Railway)

```toml
[deploy]
preDeployCommand = "pnpm exec tsx apps/api/src/database/migrate.ts"
```

- Runs in the release phase: same `DATABASE_URL` and network as the app, before new instances serve traffic.
- Non-zero exit aborts the deploy.
- Takes a Postgres advisory lock first — overlapping deploys serialize instead of racing the journal.
- This is the single source of truth for applying migrations; CI does not migrate.

## Discipline

- Commit generated `.sql` + `meta/` together with the schema change; CI treats schema-without-migration as a failure.
- Never edit an applied migration — generate a new one.
- Never `drizzle-kit push` on shared databases (no history → schema drift).

## Zero-downtime pattern

Expand (nullable/new, deploy) → Backfill (data) → Contract (constraints/drops, later deploy). Additive column + `DEFAULT` is single-step safe.
