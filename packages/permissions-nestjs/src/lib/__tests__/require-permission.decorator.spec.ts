import 'reflect-metadata';

import type { Ability } from '../../../../permissions/src/lib/types';
import { describe, expect, it, vi } from 'vitest';

import { REQUIRE_PERMISSION_KEY, RequirePermission } from '../../index';
import type { PolicyHandler } from '../../index';

type TestAbility = Ability<string, string>;

describe('RequirePermission', () => {
  it('should create decorator metadata with action and subject', () => {
    const decorator = RequirePermission('read', 'Article');

    const target = {};
    // SetMetadata returns a decorator that sets metadata on the target
    decorator(
      target,
      undefined as unknown as string,
      undefined as unknown as PropertyDescriptor
    );

    // Access the metadata key set by SetMetadata
    const handlers = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      target
    ) as PolicyHandler[];

    expect(handlers).toBeDefined();
    expect(handlers).toHaveLength(1);

    // Verify the handler checks the right action/subject
    const mockAbility: TestAbility = {
      can: vi.fn().mockReturnValue(true),
      cannot: vi.fn().mockReturnValue(false),
    };
    handlers[0](mockAbility);
    expect(mockAbility.can).toHaveBeenCalledWith('read', 'Article');
  });

  it('should create decorator metadata with PolicyHandler functions', () => {
    const customHandler: PolicyHandler<TestAbility> = (ability) =>
      ability.can('write', 'Note');

    const decorator = RequirePermission(customHandler);

    const target = {};
    decorator(
      target,
      undefined as unknown as string,
      undefined as unknown as PropertyDescriptor
    );

    const handlers = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      target
    ) as PolicyHandler[];

    expect(handlers).toBeDefined();
    expect(handlers).toHaveLength(1);

    const mockAbility: TestAbility = {
      can: vi.fn().mockReturnValue(true),
      cannot: vi.fn().mockReturnValue(false),
    };
    handlers[0](mockAbility);
    expect(mockAbility.can).toHaveBeenCalledWith('write', 'Note');
  });

  it('should support multiple PolicyHandler functions', () => {
    const handler1: PolicyHandler<TestAbility> = (ability) =>
      ability.can('read', 'Note');
    const handler2: PolicyHandler<TestAbility> = (ability) =>
      ability.can('write', 'Note');

    const decorator = RequirePermission(handler1, handler2);

    const target = {};
    decorator(
      target,
      undefined as unknown as string,
      undefined as unknown as PropertyDescriptor
    );

    const handlers = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      target
    ) as PolicyHandler[];

    expect(handlers).toHaveLength(2);
  });
});
