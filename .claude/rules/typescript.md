---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# TypeScript Rules

## Imports

- Use `import type` for type-only imports — keeps runtime bundle clean.
- Exception: in `apps/api/**`, NEVER use `import type` for classes injected via NestJS DI. See `.claude/rules/nestjs-backend.md` for details.
- Import order (enforced by Prettier plugin): React → @tanstack → third-party → @knowtis/\* → local relative.

## Type Definitions

- Prefer `interface` over `type` for object shapes — interfaces are more performant for the compiler and support declaration merging.
- Use `type` for unions, intersections, mapped types, and utility types.
- Export types with `export type` or `export interface` — separate from value exports.

## Type Safety

- Never use `any`. Use `unknown` with type narrowing (type guards, `instanceof`, discriminated unions) or Zod schema validation.
- Avoid type assertions (`as X`) — they bypass the type checker. Prefer:
  - Type guards: `function isNote(x: unknown): x is Note { ... }`
  - Schema validation: `NoteSchema.parse(data)` (Zod)
  - Discriminated unions with exhaustive switches
- Flag non-exhaustive `switch` statements on discriminated unions — add a `default: never` case to catch missing variants at compile time:
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

- Prefer const objects or union types over TypeScript `enum`. Enums have tree-shaking issues and generate runtime code.

  ```typescript
  // Prefer this
  const NoteAccess = {
    RESTRICTED: 'restricted',
    ANYONE_WITH_LINK: 'anyone_with_link',
  } as const;
  type NoteAccess = (typeof NoteAccess)[keyof typeof NoteAccess];

  // Over this
  enum NoteAccess {
    RESTRICTED = 'restricted',
    ANYONE_WITH_LINK = 'anyone_with_link',
  }
  ```

## Variables

- Use `const` by default. Use `let` only when reassignment is needed. Never use `var`.
- Always use curly braces for control structures (`if`, `for`, `while`) — even single-line bodies.

## Error Handling

- Never use empty `catch` blocks. Always log the error with context:
  - Backend: `this.logger.warn('Failed to X for entity Y', error)` or `this.logger.error(...)`.
  - Frontend: `console.error('Failed to X:', error)`.
- For non-critical failures: log a warning and continue execution — but never silently swallow the error.
- For critical failures: throw or return a Result error — let the caller decide how to handle it.
- Prefer the Result pattern (`neverthrow`) over try/catch for expected error cases in domain logic.
