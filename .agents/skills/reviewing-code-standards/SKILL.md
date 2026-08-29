---
name: reviewing-code-standards
description: Applies Knowtis engineering standards when writing, reviewing, or refactoring TypeScript/JavaScript code — import discipline, type safety, error handling, testing conventions, and the minimal-comments policy. Use when reviewing a PR or diff, refactoring existing code, writing new TS/TSX modules or tests, or when asked about "convenciones", "estándares", "code review", or code style in a Knowtis codebase. Not for commit-message formatting (use writing-conventional-commits) or architecture questions (use the domain plugin skills).
---

# Reviewing code against Knowtis standards

Apply these standards to any TypeScript/JavaScript you write or review. Full detail lives in the references — load the one matching the code at hand:

- [references/typescript.md](references/typescript.md) — imports, type safety, enums, error handling
- [references/testing.md](references/testing.md) — Vitest structure, mocking, assertions, coverage expectations
- [references/comments-policy.md](references/comments-policy.md) — the minimal-comments rule (also enforced by a repo-local hook in the knowtis repo)

## Non-negotiables (quick check)

1. **`import type` discipline**: use `import type` for type-only imports — EXCEPT classes injected via NestJS DI in `apps/api/**`, where `import type` silently breaks runtime reflection. When a NestJS provider is mysteriously `undefined`, check this first.
2. **No `any`** — use `unknown` + type guards, Zod parsing, or discriminated unions with exhaustive `switch` (add a `default: never` case).
3. **No TypeScript `enum`** — use `as const` objects with a derived union type.
4. **No empty `catch`** — log with context; prefer `neverthrow` Result for expected domain errors.
5. **Minimal comments** — default to none; only JSDoc on exported APIs, `TODO`/`FIXME`, or non-obvious WHY. Never section headers, task/PR references, tombstones, or author/date stamps.
6. **No backwards-compat hacks** — no re-exports from barrel files, no legacy shims. Renames update all consumers (clean breaks).
7. **Interfaces for object shapes, `type` for unions/intersections.** `const` by default, braces on every control structure.

## When reviewing

Walk the diff against the references and report findings as `file:line — standard violated — fix`. Flag rotted or redundant comments for deletion. Verify new code has tests covering edge cases and error states (empty inputs, 401/403/404, loading/error UI states), not just the happy path.
