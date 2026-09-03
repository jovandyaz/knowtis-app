# @jovandyaz/permissions-nestjs

NestJS guard and decorator that enforce an [`@jovandyaz/permissions-core`](../permissions/README.md) `Ability` per route. The consumer provides an `AbilityFactory` under `ABILITY_FACTORY_KEY`; `PoliciesGuard` reads `@RequirePermission` metadata, builds the ability from the request and throws `ForbiddenException('Insufficient permissions')` when any handler fails. Nx project name: `permissions-nestjs`.

## Install

Published to GitHub Packages (`publishConfig.registry` in `package.json`):

```bash
pnpm add @jovandyaz/permissions-nestjs --registry https://npm.pkg.github.com
```

Inside this monorepo, import through the `tsconfig.base.json` alias `@jovandyaz/permissions-nestjs`.

## Peer dependencies

`@jovandyaz/permissions-core`, `@nestjs/common ^11`, `@nestjs/core ^11`.

## Exports

From `src/index.ts`:

- **`RequirePermission(...)`** — two call forms: `@RequirePermission('read', 'Note')` (compiled to `ability.can('read', 'Note')`) or one or more `PolicyHandler`s, `@RequirePermission((ability) => ability.can('update', 'Note'))`. Stored under `REQUIRE_PERMISSION_KEY` (`'require_permission'`); handler metadata overrides class metadata.
- **`PoliciesGuard<TAbility>`** — `CanActivate`. Routes without `@RequirePermission` pass. The request is obtained with the optional `RequestExtractor` bound to `REQUEST_EXTRACTOR_KEY` (default: `context.switchToHttp().getRequest()`), then `AbilityFactory.createAbility(request)` (sync or async) and every handler must return `true`.
- **Interfaces:** `AbilityFactory<TAbility, TRequest = unknown>` (`createAbility(request): TAbility | Promise<TAbility>`), `RequestExtractor`, `PolicyHandler<TAbility>`.
- **DI tokens:** `ABILITY_FACTORY_KEY` (required), `REQUEST_EXTRACTOR_KEY` (optional).

## Usage

```ts
import { definePermissions, type Ability } from '@jovandyaz/permissions-core';
import {
  ABILITY_FACTORY_KEY,
  PoliciesGuard,
  RequirePermission,
  type AbilityFactory,
} from '@jovandyaz/permissions-nestjs';
import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';

type AppAbility = Ability<'read' | 'update', 'Note'>;

@Injectable()
class AppAbilityFactory implements AbilityFactory<AppAbility> {
  createAbility(): AppAbility {
    return definePermissions<AppAbility>((allow) => allow('read', 'Note'));
  }
}

@Controller('notes')
@UseGuards(PoliciesGuard)
class NotesController {
  @Get()
  @RequirePermission('read', 'Note')
  list() {
    return [];
  }
}

@Module({
  controllers: [NotesController],
  providers: [
    PoliciesGuard,
    { provide: ABILITY_FACTORY_KEY, useClass: AppAbilityFactory },
  ],
})
export class NotesModule {}
```

The API binds `ABILITY_FACTORY_KEY` to `AppAbilityFactory` in `apps/api/src/modules/authorization/authorization.module.ts` and applies `@UseGuards(JwtAuthGuard, PoliciesGuard)` on `NotesController`.

## Development

```bash
pnpm nx test permissions-nestjs
pnpm nx lint permissions-nestjs
```

Tests live in `src/lib/__tests__/`.
