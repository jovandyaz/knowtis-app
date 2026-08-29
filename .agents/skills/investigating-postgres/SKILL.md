---
name: investigating-postgres
description: Runs read-only investigations against Knowtis PostgreSQL databases — usage questions, data debugging, schema exploration — under a strict SELECT-only contract with PII redaction. Use when asked to query, count, inspect, or debug data ("cuántas notas", "qué usuarios", "revisa en la base de datos", "query the DB"). Never use for schema changes or data mutations — schema evolution goes through managing-drizzle-migrations, and flag/data changes go through the API.
---

# Investigating Postgres (read-only)

Answer data questions against Knowtis databases without ever mutating them. The full contract is in [references/read-only-contract.md](references/read-only-contract.md); the table map is in [references/schema-map.md](references/schema-map.md).

## Contract (non-negotiable)

1. **Database-enforced read-only.** MCP connections must use a dedicated read-only role. Run psql investigations inside `BEGIN TRANSACTION READ ONLY` with `ON_ERROR_STOP`; if a production connection cannot prove that boundary, do not query it.
2. **SELECT/WITH only.** A CTE must end in a read-only SELECT. No INSERT, UPDATE, DELETE, TRUNCATE, DDL, mutating CTE, or session-changing `SET`. Redirect mutations to APIs, migrations, or the application.
3. **Schema first.** Read `apps/api/src/database/schema/` (or the MCP schema tools) before writing SQL — column names come from the source of truth, not from memory.
4. **Connection comes from the user's environment.** Use `pg-knowtis-local` / `pg-knowtis-prod` or `psql "$DATABASE_URL"`. Never construct, request, or echo credentials/connection strings.
5. **LIMIT every row-listing query** (default 50). Aggregate where possible.
6. **Redact PII by default** in output: user emails, note titles/content, session tokens, provider keys. Show them only on explicit request and never against prod without confirmation.
7. **Say which database answered** (local vs prod). Treat prod as sensitive: prefer local unless the question is explicitly about production.

## Workflow

1. Restate the question as the data needed.
2. Load the schema for the tables involved ([references/schema-map.md](references/schema-map.md) lists what lives where).
3. Write the query with CTEs for readability; explain the join logic in one line.
4. Execute via MCP or psql; present results as a compact table plus a one-paragraph interpretation.
5. Empty results are an answer — report them as such; never fabricate rows.
