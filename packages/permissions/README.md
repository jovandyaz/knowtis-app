# @jovandyaz/permissions-core

Framework-agnostic permission checks wrapping CASL behind a two-method `Ability` interface (`can` / `cannot`). CASL stays inside `src/lib/internal/casl-adapter.ts` and is not exported. Consumed by [`@jovandyaz/permissions-react`](../permissions-react/README.md), [`@jovandyaz/permissions-nestjs`](../permissions-nestjs/README.md) and `libs/authorization`. Nx project name: `permissions-core`.

## Install

Published to GitHub Packages (`publishConfig.registry` in `package.json`):

```bash
pnpm add @jovandyaz/permissions-core --registry https://npm.pkg.github.com
```

Inside this monorepo, import through the `tsconfig.base.json` alias `@jovandyaz/permissions-core`.

## Dependencies

Runtime: `@casl/ability ^6.8`. No peer dependencies.

## Exports

From `src/index.ts`:

- **Types:** `Ability<TAction, TSubject>`, `ActionOf<T>`, `SubjectOf<T>`, `RuleBuilder` (`(action | action[], subject, conditions?) => void`), `RulesCallback` (`(allow, forbid) => void`), `PermissionOptions` (`{ resolveSubject? }`)
- **`definePermissions<TAbility>(callback, options?)`:** builds a typed `Ability` from a rules callback. Object subjects are resolved by their `__typename` property unless `resolveSubject` is provided.
- **`RoleManager<TAbility>`:** `new RoleManager({ roles?, resolveSubject? })` (`RoleManagerConfig`), `registerRole(name, define)`, `getRoleNames()`, `buildForRoles(roleNames)` (throws `Unknown role: <name>` for an unregistered name). The Knowtis apps do not use `RoleManager`; `libs/authorization` builds abilities with `definePermissions` only.

## Usage

```ts
import { definePermissions, type Ability } from '@jovandyaz/permissions-core';

interface Note {
  __typename: 'Note';
  ownerId: string;
}

type AppAbility = Ability<'read' | 'update', Note | 'Note'>;

const ability = definePermissions<AppAbility>((allow) => {
  allow('read', 'Note');
  allow('update', 'Note', { ownerId: 'user-1' });
});

ability.can('update', { __typename: 'Note', ownerId: 'user-1' }); // true
ability.cannot('update', { __typename: 'Note', ownerId: 'user-2' }); // true
```

## Development

```bash
pnpm nx test permissions-core
pnpm nx lint permissions-core
```

Tests live in `src/lib/__tests__/`.
