---
name: running-preflight
description: Runs the full Knowtis pre-push verification — affected lint/test/build, workspace typecheck, and pending-migration detection — and reports a ship/no-ship verdict.
disable-model-invocation: true
---

# Preflight

Run the checks CI will run, locally, and report a verdict. Execute all steps even if an early one fails — the point is a complete picture.

## Steps

```bash
# 1. What does this change touch?
pnpm nx show projects --affected --base=main --head=HEAD

# 2. The CI job:
pnpm nx affected -t lint test build --base=main --head=HEAD

# 3. Workspace-wide typecheck (CI runs this unscoped):
npx tsc --noEmit

# 4. Pending migration check — schema changed without a generated migration?
git diff --name-only main...HEAD -- apps/api/src/database/schema/ | grep -q . \
  && git diff --name-only main...HEAD -- apps/api/drizzle/ | grep -q . \
  && echo "schema + migration: OK" \
  || (git diff --name-only main...HEAD -- apps/api/src/database/schema/ | grep -q . \
      && echo "WARNING: schema changed but no migration generated — run pnpm db:generate" \
      || echo "no schema changes")
```

## Report format

End with a verdict block:

- **SHIP** — all green; list affected projects and which deploy jobs will fire on merge (notes→Vercel, api/mcp→Railway).
- **NO-SHIP** — list each failure with the exact failing command and the first relevant error lines, plus the fix order (lint → types → tests → migrations).
