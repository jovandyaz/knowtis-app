import 'reflect-metadata';

import type { Ability } from '@jovandyaz/permissions-core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AbilityFactory, RequestExtractor } from '../../index';
import { PoliciesGuard } from '../../index';

type TestAbility = Ability<string, string>;

describe('PoliciesGuard', () => {
  let guard: PoliciesGuard<TestAbility>;
  let reflector: Reflector;
  const mockFactory: AbilityFactory<TestAbility> = {
    createAbility: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    reflector = new Reflector();
    guard = new PoliciesGuard(reflector, mockFactory);
  });

  function createMockContext(user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow when no RequirePermission metadata is set', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ id: 'user-1' });

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should allow when ability.can() returns true', async () => {
    const mockAbility: TestAbility = {
      can: vi.fn().mockReturnValue(true),
      cannot: vi.fn().mockReturnValue(false),
    };
    vi.mocked(mockFactory.createAbility).mockResolvedValue(mockAbility);

    const handler = (ability: TestAbility) => ability.can('read', 'Article');
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([handler]);

    const context = createMockContext({ id: 'user-1' });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when ability.can() returns false', async () => {
    const mockAbility: TestAbility = {
      can: vi.fn().mockReturnValue(false),
      cannot: vi.fn().mockReturnValue(true),
    };
    vi.mocked(mockFactory.createAbility).mockResolvedValue(mockAbility);

    const handler = (ability: TestAbility) => ability.can('delete', 'Article');
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([handler]);

    const context = createMockContext({ id: 'user-1' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should use custom request extractor when provided', async () => {
    const customExtractor: RequestExtractor = () => ({
      user: { id: 'ws-user' },
    });
    const guardWithExtractor = new PoliciesGuard(
      reflector,
      mockFactory,
      customExtractor
    );

    const mockAbility: TestAbility = {
      can: vi.fn().mockReturnValue(true),
      cannot: vi.fn().mockReturnValue(false),
    };
    vi.mocked(mockFactory.createAbility).mockResolvedValue(mockAbility);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      (a: TestAbility) => a.can('read', 'Note'),
    ]);

    const wsContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(await guardWithExtractor.canActivate(wsContext)).toBe(true);
    expect(mockFactory.createAbility).toHaveBeenCalledWith({
      user: { id: 'ws-user' },
    });
  });
});
