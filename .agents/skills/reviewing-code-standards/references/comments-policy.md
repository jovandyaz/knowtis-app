# Minimal-comments policy

Enforcement lives outside this plugin: a user-level PreToolUse hook (`~/.claude/hooks/comment-policy.cjs`) blocks the write in every repo and inside every subagent, and knowtis also runs the same checks as the `knowtis/minimal-comments` ESLint rule for CI and non-agent edits. This skill carries the policy so it applies when reviewing/writing code in any repo or agent.

These rules are the industry consensus rather than a house invention: the *why-not-what* principle and the good/bad taxonomy come from Clean Code (Martin, ch. 4); the JSDoc-vs-`//` split, "multi-line comments use `//`", and "no boxes drawn with asterisks" come from the Google TypeScript Style Guide.

## Default

Write **no comments**. Code explains itself through clear names and structure. When a comment IS justified, aim for 1-3 lines; 6 is the hard gate.

## Justified comments (only these)

- **JSDoc on exported public APIs** — contract, not implementation: preconditions, return-value meaning, side effects. Lead with one sentence; add a second line only for a load-bearing invariant.
- **Non-obvious WHY** — hidden constraint, subtle invariant, framework quirk, or bug workaround. Explain why the code looks weird, not what it does.
- **TODO / FIXME / HACK** — with enough context for the next reader to act.
- **Informative label on an opaque literal** — three words or fewer, trailing: `'#f87171', // red`. Naming an unnamed value is the one case where restating is the point; if it deserves a name, extract a constant instead.

## Never write (the hook flags these)

- Comments paraphrasing code (`// increment counter`).
- Section headers (`// --- Helpers ---`, `// ===== State =====`).
- Task/PR/issue references (`// fix for #123`, `// changed per CR feedback`) — that history belongs in the commit message.
- Author/date stamps — `git blame` is authoritative.
- Tombstones (`// old logic kept for reference`) — delete dead code; git has the history.
- `/* */` blocks spanning more than one line — multi-line comments use consecutive `//` lines. `/** JSDoc */` stays reserved for documentation a *user* of the code reads.
- `//` blocks longer than 6 lines — move the prose to the PR or a design doc.

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
