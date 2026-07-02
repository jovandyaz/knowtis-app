# Path aliases and Nx module boundaries

Canonical sources: `tsconfig.base.json`, `nx.json`, and the Module Boundaries section of `CLAUDE.md`.

## Dual namespace — the recurring import trap

**`@knowtis/*`** — the 16 workspace libs: `ai-gateway`, `api-client`, `authorization`, `crdt`, `data-access-artifacts`, `data-access-feature-flags`, `data-access-mcp-keys`, `data-access-notes`, `data-access-users`, `design-system`, `editor`, `editor-schema`, `shared-hooks`, `shared-i18n`, `shared-types`, `shared-util`.

**`@jovandyaz/*`** — the publishable auth/permissions/email packages: `@jovandyaz/auth` (+ `@jovandyaz/auth/server`), `@jovandyaz/auth-react`, `@jovandyaz/auth-nestjs`, `@jovandyaz/permissions-core`, `@jovandyaz/permissions-react`, `@jovandyaz/permissions-nestjs`, `@jovandyaz/email`, `@jovandyaz/email-nestjs`.

There is **no** `@knowtis/auth`, `@knowtis/permissions`, or `@knowtis/email`. When an auth/permissions/email import fails to resolve, the namespace is almost always the reason.

## Module boundary tags (ESLint `@nx/enforce-module-boundaries`)

| Tag | May depend on |
| --- | --- |
| `type:app` | anything |
| `type:ui` | `type:ui`, `type:util` — must NOT reach into data-access or app |
| `type:data-access` | `type:data-access`, `type:util` |
| `type:util` | `type:util` only |

| Scope | May depend on |
| --- | --- |
| `scope:shared` | shared |
| `scope:notes` | shared, notes |
| `scope:api` | shared, api |

When creating a lib, set tags in its `project.json`; imports violating the matrix fail lint. No re-exports/barrel-file compat shims — renames update all consumers (clean-break policy).

## Naming conventions

Components PascalCase (`NoteCard.tsx`); hooks `useX.ts`; Zustand stores `x.store.ts`; types PascalCase; constants SCREAMING_SNAKE_CASE.
