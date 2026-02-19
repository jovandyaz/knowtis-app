# Permissions Packages

Architecture of `@jovandyaz/permissions-core`, `@jovandyaz/permissions-nestjs`, and `@jovandyaz/permissions-react`.

For flows, access validation, sharing mechanisms, API reference, and database schema, see [PERMISSIONS.md](PERMISSIONS.md).

---

## Dependency Graph

```
@jovandyaz/permissions-core    (framework-agnostic: types, definePermissions, RoleManager)
         ^              ^
         |              |
  permissions-react   permissions-nestjs
                             |
                      libs/authorization  (app-specific rules, roles, types)
                             |
                      apps/api            (guards wired via NestJS DI)
```

`@jovandyaz/permissions-core` is the foundation, wrapping CASL behind a simplified `Ability` interface. Framework integrations add DI/context wrappers. `libs/authorization` implements Knowtis-specific rules on top.

---

## `@jovandyaz/permissions-core`

**Path:** `packages/permissions/` — Framework-agnostic permission system wrapping CASL.
**Deps:** `@casl/ability`

**Key concept:** CASL is isolated in `src/lib/internal/casl-adapter.ts` (not exported). Consumers only interact with the `Ability` interface (`can`/`cannot`). Subject resolution for object types uses a `resolveSubject` option (defaults to `__typename` property).

**Exports:**

- **Types:** `Ability<TAction, TSubject>` (core interface), `ActionOf<T>`, `SubjectOf<T>` (type extractors), `RuleBuilder`, `RulesCallback` (rule definition callbacks), `PermissionOptions` (`{ resolveSubject? }`)
- **Factory:** `definePermissions<TAbility>(callback, options?)` — creates a typed `Ability` from a rules callback
- **Role management:** `RoleManager<TAbility>` — stores named role definitions, combines them via `buildForRoles(roleNames)`. Config via `RoleManagerConfig<TAbility>`

---

## `@jovandyaz/permissions-nestjs`

**Path:** `packages/permissions-nestjs/` — NestJS guards and decorators for permission enforcement.
**Peer deps:** `@jovandyaz/permissions-core`, `@nestjs/common ^11`, `@nestjs/core ^11`

**Key concept:** Consumers provide an `AbilityFactory` implementation (bound to `ABILITY_FACTORY_KEY`) that builds abilities from requests. The guard reads `@RequirePermission` metadata and runs policy handlers against the ability.

**Exports:**

- **Guard:** `PoliciesGuard<TAbility>` — `CanActivate` that checks `@RequirePermission` metadata, calls `AbilityFactory.createAbility(request)`, throws `ForbiddenException` on denial
- **Decorator:** `RequirePermission` — two forms: string (`@RequirePermission('read', 'Note')`) or handler (`@RequirePermission(ability => ability.can('update', 'Note'))`)
- **Interfaces:** `AbilityFactory<TAbility, TRequest = unknown>` (creates abilities from requests), `RequestExtractor` (extracts request from `ExecutionContext`, default: HTTP request), `PolicyHandler<TAbility>` (`(ability) => boolean`)
- **DI tokens:** `ABILITY_FACTORY_KEY`, `REQUEST_EXTRACTOR_KEY` (optional, for WebSocket or custom contexts), `REQUIRE_PERMISSION_KEY` (metadata key)

---

## `@jovandyaz/permissions-react`

**Path:** `packages/permissions-react/` — React context and hooks for UI permission checks.
**Peer deps:** `@jovandyaz/permissions-core`, `react ^18 || ^19`

**Key concept:** `createPermissionContext<TAbility>()` is a factory that returns a fully typed provider, hooks, and declarative component. No global state — multiple permission contexts can coexist.

**Exports:**

- **Factory:** `createPermissionContext<TAbility>()` returns:
  - **Provider:** `<PermissionProvider ability={...}>` — wraps the component tree with an ability instance
  - **Hooks:** `useAbility()` (returns `TAbility`, throws outside provider), `usePermission(action, subject)` (returns `boolean`)
  - **Component:** `<Can do="read" on="Note" fallback={...}>` — declarative permission check, renders children or fallback

---

## `libs/authorization` (Application Layer)

**Path:** `libs/authorization/` — Knowtis-specific authorization rules binding core permissions to the app domain.
**Tags:** `type:util`, `scope:shared`

**Key concept:** Defines the concrete `AppAbility` type and two ways to build it: `defineAbilityFor` (dynamic, condition-based) and `appRoleManager` (pre-defined role templates). Both can be used together or independently.

**Types:** `AppAbility` (`Ability<Action, Subject>`), `Action` (`'create' | 'read' | 'update' | 'delete' | 'share' | 'manage'`), `Subject` (`NoteSubject | 'Note'`), `NoteSubject` (`{ __typename, id, ownerId, generalAccess }`), `AuthUser` (`{ id }`), `SharedNote` (`{ noteId, permission }`), `PermissionContext` (`{ sharedNotes? }`).

**`defineAbilityFor(user, context)`:** Unauthenticated → read public notes only. Authenticated → manage owned notes, read public notes, access shared notes based on `PermissionLevel` (editor → read+update, viewer → read-only).

**`appRoleManager`** (roles): `anonymous` (read public notes), `user` (create + read public), `note:owner` (`manage` all), `note:editor` (read + update), `note:viewer` (read only). Constants in `ROLES`.

---

## How It Connects

**Backend (`apps/api`):**

```
Controller
  @RequirePermission('read', 'Note')
    → PoliciesGuard → AbilityFactory.createAbility(request)
      → defineAbilityFor(user, context) → AppAbility
        → handler(ability) → ability.can('read', 'Note')
```

**Frontend (`apps/notes`):**

```
<PermissionProvider ability={defineAbilityFor(user, context)}>
  <Can do="update" on={noteSubject}> → renders children or fallback
  usePermission('delete', 'Note')   → boolean
</PermissionProvider>
```

---

## Design Decisions

- **CASL encapsulated** — only `can()`/`cannot()` are exposed; CASL internals stay in `permissions-core`
- **Framework-agnostic core** — `permissions-core` has zero framework dependencies; React and NestJS are peer-only
- **`__typename` convention** — subject resolution uses a `__typename` property for object-type subjects
- **`createPermissionContext` factory** — returns fully typed provider/hooks without global state; avoids singletons
- **`AbilityFactory` interface** — decouples the guard from ability construction; consumers implement the factory in the app
- **Two approaches coexist** — `defineAbilityFor` for dynamic per-request abilities, `appRoleManager` for pre-defined role templates
