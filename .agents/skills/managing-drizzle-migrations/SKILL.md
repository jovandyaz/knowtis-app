---
name: managing-drizzle-migrations
description: Guides Drizzle schema changes in Knowtis — generate-commit-migrate workflow, the never-push rule, deploy-time application, baselines, and zero-downtime patterns. Use when adding/changing a column, table, index, or enum, when asked "how do I change the schema", "agregar una columna", "migración", or when migration errors appear (42710, tracking table missing). Not for querying data (use investigating-postgres).
---

# Managing Drizzle migrations

Migrations (`generate` + `migrate`) are the single source of truth for the Knowtis schema. Full runbook: [references/migrations-runbook.md](references/migrations-runbook.md).

## The rule that matters most

**Never `drizzle-kit push` against shared dev or prod databases.** `push` leaves no migration history — it is what caused the schema-drift problems migrations were adopted to fix. `push` is acceptable only on throwaway local experiments.

## Day-to-day workflow

```bash
# 1. Edit schema under apps/api/src/database/schema/
# 2. Generate the migration (repo root):
pnpm db:generate            # -> apps/api/drizzle/NNNN_*.sql + meta snapshot
# 3. Commit the .sql + meta/ changes. Never edit an applied migration.
# 4. Apply locally:
pnpm db:migrate:run
```

## Production application — hands-off

Railway's pre-deploy command (`railway.toml`) is the ONLY production migrator: `pnpm exec tsx apps/api/src/database/migrate.ts` runs between build and release with the service's own `DATABASE_URL`, takes a Postgres advisory lock (concurrent deploys serialize), and a non-zero exit **aborts the deploy** — the app never boots against an un-migrated schema. CI does not run migrations; neither should you, manually, against prod.

## Zero-downtime changes

Expand/contract for anything not backward-compatible with running code:

1. **Expand** — add nullable column / new table (deploy).
2. **Backfill** — populate (migration or job).
3. **Contract** — enforce `NOT NULL` / drop old column (later deploy).

Additive columns with a `DEFAULT` are safe in one step.

## When migrate fails on an existing DB (e.g. `42710 enum already exists`)

The DB was push-managed and has no `drizzle.__drizzle_migrations` tracking table. Baseline it once: `pnpm db:baseline` (schema already current) or `pnpm db:baseline <migration_tag>` (record only up to a tag). Idempotent. Dev and prod are already tracked — this applies only to adopting a new push-managed database.
