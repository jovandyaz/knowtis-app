import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_FLAG_KEY, FeatureFlagGuard } from '../feature-flag.guard';
import { FeatureFlagsService } from '../feature-flags.service';

function createMockExecutionContext(
  overrides: Partial<ExecutionContext> = {}
): ExecutionContext {
  return {
    getHandler: vi.fn().mockReturnValue(() => {}),
    getClass: vi.fn().mockReturnValue(class {}),
    getArgs: vi.fn(),
    getArgByIndex: vi.fn(),
    switchToRpc: vi.fn(),
    switchToHttp: vi.fn(),
    switchToWs: vi.fn(),
    getType: vi.fn(),
    ...overrides,
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard', () => {
  let guard: FeatureFlagGuard;
  let reflector: Reflector;
  let featureFlagsService: { isEnabled: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    reflector = new Reflector();
    featureFlagsService = { isEnabled: vi.fn() };
    guard = new FeatureFlagGuard(
      reflector,
      featureFlagsService as unknown as FeatureFlagsService
    );
  });

  it('should return true when no feature flag is required', async () => {
    const context = createMockExecutionContext();
    vi.spyOn(reflector, 'getAllAndMerge').mockReturnValue([]);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(featureFlagsService.isEnabled).not.toHaveBeenCalled();
  });

  it('should return true when the required flag is enabled', async () => {
    const context = createMockExecutionContext();
    vi.spyOn(reflector, 'getAllAndMerge').mockReturnValue(['test_flag']);
    featureFlagsService.isEnabled.mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith('test_flag');
  });

  it('should throw ForbiddenException when the required flag is disabled', async () => {
    const context = createMockExecutionContext();
    vi.spyOn(reflector, 'getAllAndMerge').mockReturnValue(['disabled_flag']);
    featureFlagsService.isEnabled.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      "Feature 'disabled_flag' is not enabled"
    );
  });

  it('should check all flags from both handler and class levels', async () => {
    const context = createMockExecutionContext();
    vi.spyOn(reflector, 'getAllAndMerge').mockReturnValue([
      'voice_notes_enabled',
      'ai_enabled',
    ]);
    featureFlagsService.isEnabled.mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith(
      'voice_notes_enabled'
    );
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith('ai_enabled');
    expect(featureFlagsService.isEnabled).toHaveBeenCalledTimes(2);
  });

  it('should throw if any flag in a compound set is disabled', async () => {
    const context = createMockExecutionContext();
    vi.spyOn(reflector, 'getAllAndMerge').mockReturnValue([
      'voice_notes_enabled',
      'ai_enabled',
    ]);
    featureFlagsService.isEnabled
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should read metadata from both handler and class', async () => {
    const handler = vi.fn();
    const cls = class TestController {};
    const context = createMockExecutionContext({
      getHandler: vi.fn().mockReturnValue(handler),
      getClass: vi.fn().mockReturnValue(cls),
    });

    const spy = vi.spyOn(reflector, 'getAllAndMerge').mockReturnValue([]);

    await guard.canActivate(context);

    expect(spy).toHaveBeenCalledWith(FEATURE_FLAG_KEY, [handler, cls]);
  });
});
