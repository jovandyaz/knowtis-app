---
name: running-preflight
license: MIT
description: Runs the full Knowtis pre-push verification — affected lint, typecheck, test, production build, and migration-drift detection — and reports a SHIP or NO-SHIP verdict. Invoke explicitly before pushing or opening a PR.
---

# Preflight

Run the checks CI will run, locally, and report a verdict. Execute all steps even if an early one fails — the point is a complete picture.

## Steps

```bash
# 1. What does this change touch?
pnpm nx show projects --affected --base=main --head=HEAD

# 2. Affected lint and typecheck:
pnpm nx affected -t lint typecheck --base=main --head=HEAD

# 3. Apply committed migrations to the local test database:
pnpm nx db:migrate:run api

# 4. Affected tests with CI's runner limits:
pnpm nx affected -t test --parallel=2 --outputStyle=stream --base=main --head=HEAD -- --run

# 5. Affected production builds:
pnpm nx affected -t build --configuration=production --base=main --head=HEAD

# 6. Generate from the current schema and reject tracked or untracked drift:
pnpm nx db:generate api
test -z "$(git status --porcelain --untracked-files=all -- apps/api/drizzle/)"
```

## Report format

End with a verdict block:

- **SHIP** — all green; list affected projects and deploy jobs (notes/backoffice → Vercel, API/MCP → Railway).
- **NO-SHIP** — list every failure with the exact command and first relevant error lines, then give the fix order (lint → types → test DB migration → tests → migration drift → build).
