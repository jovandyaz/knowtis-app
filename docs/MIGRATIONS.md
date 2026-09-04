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
   The Lefthook pre-commit hook (`lefthook.yml`, `check-migrations`) does this
   for you when a staged file matches `apps/api/src/database/schema/**/*.ts`: it
   runs `nx db:generate api` and stages whatever appears under `apps/api/drizzle/`.
3. Commit the generated `.sql` + `meta/` changes. Never edit an applied migration.
4. Apply locally to your dev DB:
   ```bash
   pnpm db:migrate:run         # programmatic migrate() against $DATABASE_URL
   ```
   (`pnpm db:migrate`, the raw `drizzle-kit migrate`, also works once the DB is
   tracked — see bootstrap below.)

## Bootstrapping a fresh local DB

`pnpm run setup` (`tools/setup.mjs`; use `pnpm run` because `setup` is also a
pnpm built-in) scaffolds `.env` files, starts Docker, and initializes the local
database. Then, or on any fresh Postgres:

```bash
pnpm docker:up
pnpm db:migrate:run
```

If the local database was initialized with `db:push` (for example by an older
version of the setup script), it has no migration journal. Run `pnpm db:baseline`
once before `pnpm db:migrate:run`; see the next section.

## CI

`.github/workflows/ci.yml` applies the committed migrations to the CI Postgres
(`nx db:migrate:run api`) before the test step, so `*.db.spec.ts` specs run
against the real schema. After tests it runs `nx db:generate api` and fails the
job when that produces any change under `apps/api/drizzle/` — a schema edit
without its migration never reaches `main`.

## Automatic application on deploy

Railway runs a **pre-deploy command** (declared for `knowtis_app` in [`.railway/railway.ts`](../.railway/railway.ts)) between build and release:

```ts
preDeployCommand: ['pnpm exec tsx apps/api/src/database/migrate.ts'],
```

This is the **single source of truth** for applying migrations. It runs
`migrate()` against the service's own `DATABASE_URL` — the same connection the app
uses, so there is no risk of a CI secret drifting from the real database — and a
non-zero exit **aborts the deploy**, so the app never boots against an un-migrated
schema. Run the exact same path locally with `pnpm db:migrate:run`.

`apps/api/src/database/migrate.ts`:

1. Takes the Postgres advisory lock `MIGRATION_LOCK_KEY`, so overlapping deploys
   serialize instead of racing the journal.
2. Only then sets `lock_timeout` (`LOCK_TIMEOUT_SECONDS`, 5s). Setting it before
   the advisory lock would make a deploy queued behind another one fail instead of
   waiting its turn.
3. Runs `migrate()` through `applyWithLockRetry`
   (`database/migration-retry.ts`), which retries only a Postgres lock timeout
   (`55P03`) up to `MAX_MIGRATION_ATTEMPTS` (3) with a 3s delay. Any other error,
   or exhausting the attempts, rejects and blocks the deploy.

## One-time bootstrap for an existing (push-managed) database

A database that was previously managed with `drizzle-kit push` has **no
`drizzle.__drizzle_migrations` tracking table**, so `migrate()` would try to
re-run every migration from `0000` and fail (e.g. `42710 enum already exists`).

Run the baseline **once per environment** to record the migrations whose schema
is already present, then migrations become fully automatic:

Before running it, compare the live schema with the migration range you intend
to record and abort on any mismatch. `baseline` records journal hashes; it does
not verify schema equivalence or apply missing DDL.

```bash
# DB already at the latest schema → record everything as applied:
pnpm db:baseline

# DB still behind by the newest migration(s) → record only up to a tag,
# leaving the rest for the next migrate()/deploy to apply:
pnpm db:baseline 0007_worried_zaladane
```

`baseline` reads the exact hashes/timestamps via Drizzle's `readMigrationFiles`,
so the rows it inserts match what `migrate()` checks. It is idempotent.

> Dev and prod are already tracked (migrate-managed), so the baseline above is
> only needed when adopting a push-managed database.

## Zero-downtime changes

Use the expand/contract pattern for changes that aren't backward-compatible with
the currently-running code:

1. **Expand** — add nullable column / new table (deploy).
2. **Backfill** — populate data (migration or job).
3. **Contract** — enforce `NOT NULL` / drop old column (later deploy).

Additive columns with a `DEFAULT` (e.g. `family_id`) are safe in a single step.
