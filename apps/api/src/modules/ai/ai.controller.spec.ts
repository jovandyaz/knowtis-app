import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { RolesGuard } from '../authorization/roles.guard';
import { AIController } from './ai.controller';

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
  ])('applies RolesGuard to %s', (_name, handler) => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', handler) ?? [];

    expect(guards).toContain(RolesGuard);
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
