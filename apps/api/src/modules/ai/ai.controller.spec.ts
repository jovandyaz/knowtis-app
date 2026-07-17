import type { RequestUser } from '@jovandyaz/auth/server';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { RolesGuard } from '../authorization/roles.guard';
import { AIController } from './ai.controller';
import { UserScopedThrottlerGuard } from './guards/user-scoped-throttler.guard';

function createContext(role: string | undefined, handler: object) {
  return {
    getHandler: () => handler,
    getClass: () => AIController,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { id: 'u1', role } : { id: 'u1' } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AIController config role gating', () => {
  const guard = new RolesGuard(new Reflector());

  it.each([
    ['getConfig', AIController.prototype.getConfig],
    ['setConfig', AIController.prototype.setConfig],
    ['resetConfig', AIController.prototype.resetConfig],
  ])('applies RolesGuard to %s', (_name, handler) => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', handler) ?? [];

    expect(guards).toContain(RolesGuard);
  });

  it.each([
    ['getConfig', AIController.prototype.getConfig],
    ['setConfig', AIController.prototype.setConfig],
    ['resetConfig', AIController.prototype.resetConfig],
  ])('applies user-scoped throttling to %s', (_name, handler) => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', handler) ?? [];

    expect(guards).toContain(UserScopedThrottlerGuard);
  });

  it('rejects a non-admin user reading the AI config', () => {
    expect(() =>
      guard.canActivate(createContext('user', AIController.prototype.getConfig))
    ).toThrow(ForbiddenException);
  });

  it('rejects a user without role reading the AI config', () => {
    expect(() =>
      guard.canActivate(
        createContext(undefined, AIController.prototype.getConfig)
      )
    ).toThrow(ForbiddenException);
  });

  it('allows an admin to read the AI config', () => {
    expect(
      guard.canActivate(
        createContext('admin', AIController.prototype.getConfig)
      )
    ).toBe(true);
  });
});

describe('AIController resetConfig', () => {
  it('returns the effective config list after a reset', async () => {
    const effective = [
      {
        key: 'ai_default_model',
        value: 'openrouter:minimax/minimax-m2.5',
        kind: 'model',
        source: 'default',
        description: null,
        updatedAt: null,
      },
    ];
    const aiConfigService = {
      resetConfig: vi.fn().mockResolvedValue(undefined),
      getEffectiveConfig: vi.fn().mockResolvedValue(effective),
    };
    const controller = new AIController(
      {} as never,
      {} as never,
      aiConfigService as never,
      {} as never,
      {} as never
    );

    const result = await controller.resetConfig(
      { id: 'u1' } as RequestUser,
      'ai_default_model'
    );

    expect(aiConfigService.resetConfig).toHaveBeenCalledWith(
      'ai_default_model',
      'u1'
    );
    expect(result).toBe(effective);
  });
});
