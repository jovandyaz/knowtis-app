---
paths:
  - 'apps/api/**'
---

# API

- Never `import type` a class injected through a constructor: NestJS resolves providers from `emitDecoratorMetadata`, and an erased import breaks DI silently. `consistent-type-imports` is off here for that reason, and nothing catches a hand-written one. Ports injected with `@Inject(TOKEN)` may use `import type`.
- Code in `modules/**/domain/` imports only stdlib, `neverthrow` and domain types, never Drizzle or `@nestjs/*`. Handlers in `application/` reach the database only through repository ports.
- Wrap user input in `escapeLike()` (`database/escape-like.ts`) before `like`/`ilike`: Drizzle parameterizes the value, not its `%` and `_` wildcards.
- New list endpoints return `{ items, total, page, limit }`, with defaults and ceilings from `core/pagination`. `GET /admin/users` is the canonical example.
- The refresh cookie name is per frontend, resolved from `Origin`: `rid` for notes, `rid_bo` for backoffice. Both call one API origin, so a shared name would rotate one token and hand each app the other's identity, including an admin's. A new frontend gets a new name.
