# @jovandyaz/permissions-react

React context for an [`@jovandyaz/permissions-core`](../permissions/README.md) `Ability`. A single factory returns a typed provider, two hooks and a declarative component; there is no global state, so several permission contexts can coexist. Nx project name: `permissions-react`.

## Install

Published to GitHub Packages (`publishConfig.registry` in `package.json`):

```bash
pnpm add @jovandyaz/permissions-react --registry https://npm.pkg.github.com
```

Inside this monorepo, import through the `tsconfig.base.json` alias `@jovandyaz/permissions-react`.

## Peer dependencies

`@jovandyaz/permissions-core`, `react ^18 || ^19`.

## Exports

From `src/index.ts`: `createPermissionContext<TAbility>()`, which returns

- `PermissionProvider({ ability, children })`
- `useAbility(): TAbility`, throws when rendered outside the provider
- `usePermission(action, subject): boolean`
- `Can({ do, on, children, fallback = null })`, renders `children` when `ability.can(do, on)` is true, otherwise `fallback`

`action` and `subject` are typed with `ActionOf<TAbility>` / `SubjectOf<TAbility>`.

## Usage

```tsx
import { definePermissions, type Ability } from '@jovandyaz/permissions-core';
import { createPermissionContext } from '@jovandyaz/permissions-react';

type AppAbility = Ability<'read' | 'update', 'Note'>;

const { PermissionProvider, Can, usePermission } =
  createPermissionContext<AppAbility>();

const ability = definePermissions<AppAbility>((allow) => {
  allow('read', 'Note');
});

function EditButton() {
  const canEdit = usePermission('update', 'Note');
  return <button disabled={!canEdit}>Edit</button>;
}

export function App() {
  return (
    <PermissionProvider ability={ability}>
      <Can do="read" on="Note" fallback={<p>No access</p>}>
        <EditButton />
      </Can>
    </PermissionProvider>
  );
}
```

In the notes app the context is created in `apps/notes/src/providers/ability-context.ts` and mounted by `AbilityProvider`; see [docs/PERMISSIONS.md](../../docs/PERMISSIONS.md#authorization--permissions-packages) for what the app actually consumes.

## Development

```bash
pnpm nx test permissions-react
pnpm nx lint permissions-react
```

Tests live in `src/lib/__tests__/` (jsdom).
