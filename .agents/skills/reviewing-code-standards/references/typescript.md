# TypeScript standards

Canonical source: `.claude/rules/typescript.md` and `.claude/rules/nestjs-backend.md` in the knowtis repo.

## Imports

- Use `import type` for type-only imports — keeps the runtime bundle clean.
- **Exception (critical):** in `apps/api/**`, NEVER use `import type` for classes injected via NestJS constructors. NestJS resolves providers through runtime reflection (`emitDecoratorMetadata`); `import type` is erased at compile time and breaks DI silently — the injected dependency arrives as `undefined` with no error at the import site. ESLint `consistent-type-imports` is intentionally disabled for `apps/api/**` so auto-fix cannot introduce this bug.
- Import order (Prettier plugin enforces): React → @tanstack → third-party → `@knowtis/*` → local relative.

## Type definitions

- Prefer `interface` for object shapes (compiler performance, declaration merging); `type` for unions, intersections, mapped and utility types.
- Export types explicitly with `export type` / `export interface`, separate from value exports.

## Type safety

- Never `any`. Use `unknown` narrowed by type guards, `instanceof`, discriminated unions, or Zod schema validation (`NoteSchema.parse(data)`).
- Avoid `as` assertions — they bypass the checker. Prefer guards (`function isNote(x: unknown): x is Note`) or schema parsing.
- Discriminated-union `switch` statements must be exhaustive:

  ```typescript
  switch (action.type) {
    case 'create':
      return handleCreate(action);
    case 'delete':
      return handleDelete(action);
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unhandled action: ${_exhaustive}`);
    }
  }
  ```

## Enums

Prefer `as const` objects over `enum` (tree-shaking, no generated runtime code):

```typescript
const NoteAccess = {
  RESTRICTED: 'restricted',
  ANYONE_WITH_LINK: 'anyone_with_link',
} as const;
type NoteAccess = (typeof NoteAccess)[keyof typeof NoteAccess];
```

## Variables and control flow

- `const` by default; `let` only on reassignment; never `var`.
- Curly braces on every control structure, including single-line bodies.

## Error handling

- Never empty `catch`. Log with context: backend `this.logger.warn('Failed to X for entity Y', error)`; frontend `console.error('Failed to X:', error)`.
- Non-critical failure → warn and continue. Critical failure → throw or return a Result error and let the caller decide.
- Prefer the Result pattern (`neverthrow`) over try/catch for expected error cases in domain logic.

## NestJS specifics (apps/api)

- Symbol-based injection tokens for ports: `export const NOTE_REPOSITORY = Symbol('NOTE_REPOSITORY');`.
- Read env vars only through injected `ConfigService` (validated with Zod in `env.config.ts`) — never `process.env` directly; add new vars to the Zod schema first.
- Throw NestJS exception classes (`NotFoundException`, `BadRequestException`, …) from controllers — never bare `Error`.
- DTOs use `class-validator` decorators; domain entities have ZERO infrastructure imports; Drizzle mutations always chain `.returning()`; use the query builder, never raw SQL strings.
