# Database Migrations

Knowtis uses **Drizzle migrations** (`generate` + `migrate`) as the source of truth
for the database schema. Migration files in `apps/api/drizzle/` are versioned,
reviewed in PRs, and **applied automatically on every deploy**.

> Do **not** use `drizzle-kit push` against the shared dev or prod databases.
> `push` is only for throwaway local experiments. It leaves no migration history,
> which is what caused the "schema drift" / un-tracked DB problems before.

## Day-to-day workflow

1. Edit the schema under `apps/api/src/database/schema/`.
2. Generate a migration (run from the repo root):
   ```bash
   pnpm db:generate            # -> apps/api/drizzle/NNNN_*.sql + meta snapshot
   ```
3. Commit the generated `.sql` + `meta/` changes. Never edit an applied migration.
4. Apply locally to your dev DB:
   ```bash
   pnpm db:migrate:run         # programmatic migrate() against $DATABASE_URL
   ```
   (`pnpm db:migrate`, the raw `drizzle-kit migrate`, also works once the DB is
   tracked — see bootstrap below.)

## Automatic application on deploy

Railway runs a **pre-deploy command** (`railway.toml`) between build and release:

```toml
[deploy]
preDeployCommand = "pnpm exec tsx apps/api/src/database/migrate.ts"
```

It runs `migrate()` against the service's `DATABASE_URL` before the new code
serves traffic. A non-zero exit **aborts the deploy**, so the app never boots
against an un-migrated schema. The same script powers CI and local runs, so
behaviour is identical everywhere. It depends only on `drizzle-orm` + `postgres`
(runtime deps) plus the committed `.sql` files.

## One-time bootstrap for an existing (push-managed) database

A database that was previously managed with `drizzle-kit push` has **no
`drizzle.__drizzle_migrations` tracking table**, so `migrate()` would try to
re-run every migration from `0000` and fail (e.g. `42710 enum already exists`).

Run the baseline **once per environment** to record the migrations whose schema
is already present, then migrations become fully automatic:

```bash
# DB already at the latest schema → record everything as applied:
pnpm db:baseline

# DB still behind by the newest migration(s) → record only up to a tag,
# leaving the rest for the next migrate()/deploy to apply:
pnpm db:baseline 0007_worried_zaladane
```

`baseline` reads the exact hashes/timestamps via Drizzle's `readMigrationFiles`,
so the rows it inserts match what `migrate()` checks. It is idempotent.

### Bootstrapping prod for the current release

Prod is at `0007`; `0008_session_rotation_family` is not yet applied. Pick one:

- **Recommended (fully automatic):**
  ```bash
  DATABASE_URL=<prod> pnpm db:baseline 0007_worried_zaladane
  ```
  Then deploy — the pre-deploy command applies `0008` automatically.
- **Manual delta first:** apply `apps/api/drizzle/0008_session_rotation_family.sql`
  with `psql`, then `DATABASE_URL=<prod> pnpm db:baseline` (records all, incl. 0008).

After bootstrap, every future migration is applied automatically by the
pre-deploy command — no manual steps.

## Zero-downtime changes

Use the expand/contract pattern for changes that aren't backward-compatible with
the currently-running code:

1. **Expand** — add nullable column / new table (deploy).
2. **Backfill** — populate data (migration or job).
3. **Contract** — enforce `NOT NULL` / drop old column (later deploy).

Additive columns with a `DEFAULT` (e.g. `family_id`) are safe in a single step.
