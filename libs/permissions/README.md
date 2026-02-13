# @jovandyaz/permissions

Type-safe, framework-agnostic permissions library with first-class React and NestJS integrations.

## Features

- **Core** — `definePermissions` factory and `RoleManager` for role-based permissions
- **React** — `createPermissionContext` factory returning `PermissionProvider`, `Can`, `useAbility`, `usePermission`
- **NestJS** — `PoliciesGuard` with `@RequirePermission` decorator and configurable request extraction

## Installation

```bash
# Core (required)
pnpm add @jovandyaz/permissions

# React integration (optional — requires react as peer)
# No additional packages needed beyond react

# NestJS integration (optional — requires @nestjs/common and @nestjs/core as peers)
# No additional packages needed beyond NestJS
```

## Quick Start

### Define Permissions

```typescript
import { definePermissions } from '@jovandyaz/permissions';
import type { Ability } from '@jovandyaz/permissions';

type AppAbility = Ability<'read' | 'create' | 'delete', 'Article' | 'all'>;

const ability = definePermissions<AppAbility>((allow, forbid) => {
  allow('read', 'Article');
  allow('create', 'Article');
  forbid('delete', 'Article');
});

ability.can('read', 'Article'); // true
ability.can('delete', 'Article'); // false
```

### Condition-Based Rules

```typescript
import { definePermissions } from '@jovandyaz/permissions';
import type { Ability } from '@jovandyaz/permissions';

type NoteSubject = { __typename: 'Note'; id: string; ownerId: string };
type AppAbility = Ability<'read' | 'update' | 'delete', 'Note' | NoteSubject>;

const ability = definePermissions<AppAbility>((allow) => {
  allow('read', 'Note');
  allow('update', 'Note', { ownerId: currentUser.id });
});
```

By default, object subjects are resolved by reading their `__typename` property. Provide `resolveSubject` in the options to override:

```typescript
const ability = definePermissions<AppAbility>(
  (allow) => {
    allow('read', 'Note');
  },
  { resolveSubject: (subject) => subject.kind }
);
```

### Role Management

```typescript
import { RoleManager } from '@jovandyaz/permissions';

const manager = new RoleManager<AppAbility>({
  roles: {
    viewer: (allow) => {
      allow('read', 'Article');
    },
    editor: (allow) => {
      allow('read', 'Article');
      allow('create', 'Article');
    },
    admin: (allow) => {
      allow('manage', 'all');
    },
  },
});

const ability = manager.buildForRoles(['viewer', 'editor']);
```

Roles can also be registered dynamically:

```typescript
manager.registerRole('moderator', (allow) => {
  allow('delete', 'Article');
});

manager.getRoleNames(); // ['viewer', 'editor', 'admin', 'moderator']
```

### React Integration

```tsx
import { createPermissionContext } from '@jovandyaz/permissions/react';

const { PermissionProvider, Can, useAbility, usePermission } =
  createPermissionContext<AppAbility>();

function App() {
  return (
    <PermissionProvider ability={ability}>
      <Can do="read" on="Article">
        <p>You can read articles</p>
      </Can>
      <Can do="delete" on="Article" fallback={<p>No access</p>}>
        <button>Delete</button>
      </Can>
    </PermissionProvider>
  );
}
```

#### Hooks

```tsx
function EditButton() {
  // Full ability object
  const ability = useAbility();

  // Shorthand boolean check
  const canEdit = usePermission('update', 'Article');

  if (!canEdit) return null;
  return <button>Edit</button>;
}
```

### NestJS Integration

```typescript
import {
  ABILITY_FACTORY_KEY,
  PoliciesGuard,
  RequirePermission,
} from '@jovandyaz/permissions/nestjs';
import type { AbilityFactory } from '@jovandyaz/permissions/nestjs';

// 1. Implement AbilityFactory
@Injectable()
class MyAbilityFactory implements AbilityFactory<AppAbility> {
  createAbility(request: { user?: User }): AppAbility {
    return definePermissions<AppAbility>((allow) => {
      if (request.user) {
        allow('read', 'Article');
        allow('create', 'Article');
      }
    });
  }
}

// 2. Register in module
@Module({
  providers: [
    MyAbilityFactory,
    { provide: ABILITY_FACTORY_KEY, useExisting: MyAbilityFactory },
    PoliciesGuard,
  ],
  exports: [ABILITY_FACTORY_KEY, PoliciesGuard],
})
export class AuthorizationModule {}

// 3. Use in controllers — simple form
@Controller('articles')
@UseGuards(PoliciesGuard)
export class ArticlesController {
  @Get()
  @RequirePermission('read', 'Article')
  findAll() {
    /* ... */
  }

  // Callback form for complex checks
  @Delete(':id')
  @RequirePermission((ability: AppAbility) => ability.can('delete', 'Article'))
  remove() {
    /* ... */
  }
}
```

#### Custom Request Extraction (WebSocket, GraphQL)

By default, `PoliciesGuard` extracts the request from an HTTP context. Provide a custom `REQUEST_EXTRACTOR_KEY` for other transports:

```typescript
import { REQUEST_EXTRACTOR_KEY } from '@jovandyaz/permissions/nestjs';

@Module({
  providers: [
    {
      provide: REQUEST_EXTRACTOR_KEY,
      useValue: (context: ExecutionContext) =>
        context.switchToWs().getClient().handshake,
    },
  ],
})
export class WsAuthorizationModule {}
```

## API Reference

### Core (`@jovandyaz/permissions`)

| Export              | Kind     | Description                                             |
| ------------------- | -------- | ------------------------------------------------------- |
| `definePermissions` | Function | Create an ability from `(allow, forbid)` builder        |
| `RoleManager`       | Class    | Manage named roles and build combined abilities         |
| `Ability`           | Type     | Core permission checker interface (`can` / `cannot`)    |
| `ActionOf`          | Type     | Extracts the action type from an `Ability`              |
| `SubjectOf`         | Type     | Extracts the subject type from an `Ability`             |
| `RuleBuilder`       | Type     | Builder function for individual permission rules        |
| `RulesCallback`     | Type     | Callback receiving `allow` and `forbid` builders        |
| `PermissionOptions` | Type     | Options for `definePermissions` (e.g. `resolveSubject`) |
| `RoleManagerConfig` | Type     | Configuration for `RoleManager` constructor             |

### React (`@jovandyaz/permissions/react`)

| Export                    | Kind     | Description                                                                  |
| ------------------------- | -------- | ---------------------------------------------------------------------------- |
| `createPermissionContext` | Function | Factory returning `PermissionProvider`, `Can`, `useAbility`, `usePermission` |

### NestJS (`@jovandyaz/permissions/nestjs`)

| Export                   | Kind      | Description                                     |
| ------------------------ | --------- | ----------------------------------------------- |
| `PoliciesGuard`          | Class     | NestJS guard that evaluates policy handlers     |
| `RequirePermission`      | Decorator | Attach permission checks to routes              |
| `ABILITY_FACTORY_KEY`    | Symbol    | DI token for providing an `AbilityFactory`      |
| `REQUEST_EXTRACTOR_KEY`  | Symbol    | DI token for custom request extraction          |
| `REQUIRE_PERMISSION_KEY` | Constant  | Metadata key used internally by `PoliciesGuard` |
| `AbilityFactory`         | Type      | Interface for creating abilities from requests  |
| `RequestExtractor`       | Type      | Extracts request from `ExecutionContext`        |
| `PolicyHandler`          | Type      | Evaluates a policy against an ability           |

## TypeScript

Requires `moduleResolution: "bundler"` or `"node16"` in your `tsconfig.json`.

## License

MIT
