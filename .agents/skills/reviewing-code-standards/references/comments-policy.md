# Minimal-comments policy

Enforced automatically by this plugin's PostToolUse hook (`scripts/check-comments.mjs`) on TS/TSX/JS/JSX edits.

## Default

Write **no comments**. Code explains itself through clear names and structure. When a comment IS justified, keep it 1-3 lines.

## Justified comments (only these)

- **JSDoc on exported public APIs** — contract, not implementation: preconditions, return-value meaning, side effects. Lead with one sentence; add a second line only for a load-bearing invariant.
- **Non-obvious WHY** — hidden constraint, subtle invariant, framework quirk, or bug workaround. Explain why the code looks weird, not what it does.
- **TODO / FIXME / HACK** — with enough context for the next reader to act.

## Never write (the hook flags these)

- Comments paraphrasing code (`// increment counter`).
- Section headers (`// --- Helpers ---`, `// ===== State =====`).
- Task/PR/issue references (`// fix for #123`, `// changed per CR feedback`) — that history belongs in the commit message.
- Author/date stamps — `git blame` is authoritative.
- Tombstones (`// old logic kept for reference`) — delete dead code; git has the history.
- `//` blocks longer than 3 lines — move prose to the PR or a design doc.

## Heuristics

- If deleting the comment wouldn't confuse a competent reader, delete it.
- If tempted to explain *what* code does, rename a variable or extract a function instead.
- When reviewing: aggressively remove comments that restate code, reference past tasks, or have rotted out of sync.

## Examples

```ts
// BAD — paraphrases the code
// increment the retry counter and check if we should give up
retryCount++;

// GOOD — non-obvious WHY
// Hocuspocus' DirectConnection.transact overrides our origin tag, so
// origin-based filtering inside the persistence extension is unreliable
// through this code path.
const result = await direct.transact(callback);
```
