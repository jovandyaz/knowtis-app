# Read-only investigation contract

## Database boundary

- `pg-knowtis-local` and `pg-knowtis-prod` must authenticate with dedicated read-only roles.
- A psql investigation runs the query and any `SET LOCAL statement_timeout` inside one `BEGIN TRANSACTION READ ONLY` / `COMMIT` block with `ON_ERROR_STOP=1`.
- If a production connection cannot establish that boundary, stop rather than relying on prompt-level SQL classification.

## Allowed

- `SELECT`, `WITH ... SELECT`, `EXPLAIN`, and `EXPLAIN ANALYZE` only for SELECT statements inside the read-only boundary.
- Schema introspection: `information_schema`, `pg_catalog` reads, MCP `list_objects` / `get_object_details` tools.
- Transaction-local settings such as `SET LOCAL statement_timeout`.

## Forbidden — refuse, don't negotiate

- Any mutation: `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `MERGE`, `COPY ... FROM`.
- Data-modifying CTEs, even when the statement begins with `WITH`.
- Any DDL: `CREATE`, `ALTER`, `DROP`, index changes.
- `EXPLAIN ANALYZE` on mutating statements (it executes them).
- Redirect instead: feature flags → `PUT /api/v1/flags/:key`; schema changes → the managing-drizzle-migrations skill; user data fixes → the application/API with proper authorization.

## Redaction defaults

| Data | Default treatment |
| --- | --- |
| `users.email`, names | Mask (`j***@…`) or aggregate |
| `notes.title`, `notes.content`, `yjs_state` | Never dump content; count/measure instead |
| `sessions.*`, `*_tokens`, `user_provider_keys` | Metadata only (counts, ages) — never values |
| IDs (UUIDs) | Fine to show; they are opaque |

## Production discipline

- Prefer `pg-knowtis-local` for anything answerable locally.
- Prod queries: read-only replicas of intent — analytical, bounded (`LIMIT`, time-window predicates), and announced ("querying prod").
- Long scans on prod need a time-boxed `statement_timeout` and ideally an index-friendly predicate — check with `EXPLAIN` first.
