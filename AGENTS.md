# Knowtis

Run tasks through `pnpm nx`; pnpm is the only package manager.

## Code

- No backwards-compatibility hacks: no legacy shims, compat re-exports or "old key" comments. When something is renamed or moved, update every consumer.
- A package's root `index.ts` is its public API and the only barrel that belongs. Inside an app or package, import from the file that defines the symbol. Do not add `index.ts` barrels; if a change would extend one, point its consumers at the source files and delete it (barrels breed circular dependencies between NestJS providers, defeat Vite tree-shaking and slow its dev server). Never re-export a symbol another package or folder owns.
- The auth, permissions, email and ai-gateway packages are `@jovandyaz/*` only: there is no `@knowtis/auth`, `@knowtis/permissions`, `@knowtis/email` or `@knowtis/ai-gateway`. Everything else is `@knowtis/*`.
- `packages/shared/*` and `packages/ai-gateway` have no workspace dependencies by design; lint rejects them, and rejects NestJS and the AI SDK in `ai-gateway`.
- Comments only state a non-obvious why; `knowtis/minimal-comments` flags the rest.
- UI is mobile-first: build and check the mobile viewport first, then add breakpoints. Prefer `@knowtis/design-system` components over raw elements.

## Environment

- `pnpm run setup` bootstraps a checkout; `run` is required because `setup` is a pnpm built-in.
- Apply schema changes with `pnpm db:migrate:run`. Never run `pnpm db:push` against a shared database: it is `drizzle-kit push --force`.
- "Waiting for <project>:serve in another nx process" with the port free means an orphaned `nx serve` holds the task lock: run `pnpm dev:stop`.
- AI features need `OPENROUTER_API_KEY` in `apps/api/.env` and the `ai_enabled` flag on in the DB (it has no seeded row, and a missing flag reads off). BYOK also needs `BYOK_ENCRYPTION_KEY` (32 bytes, base64) and has no flag of its own.

## Pull requests

- Keep every PR under 100 changed files: CodeRabbit refuses larger ones and the cap is not configurable.
- CodeRabbit does nothing until someone comments `@coderabbitai full review`. Confirm inline comments exist afterwards: a green check with none is a skipped review.
- Branches use a Conventional prefix: `feat/<name>`, `fix/<name>`, `docs/<name>`.
