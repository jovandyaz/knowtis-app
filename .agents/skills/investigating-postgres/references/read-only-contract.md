# Read-only investigation contract

## Allowed

- `SELECT`, `WITH ... SELECT`, `EXPLAIN`, `EXPLAIN ANALYZE` on SELECT statements.
- Schema introspection: `information_schema`, `pg_catalog` reads, MCP `list_objects` / `get_object_details` tools.
- Session-local, harmless settings like `SET statement_timeout` for a long analytical query.

## Forbidden — refuse, don't negotiate

- Any mutation: `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `MERGE`, `COPY ... FROM`.
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
