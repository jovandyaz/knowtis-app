import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flag.guard';
import { FeatureFlagsService } from '../feature-flags.service';

class NoMetadataController {
  handler(): void {}
}

@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
class ClassLevelController {
  handler(): void {}
}

class HandlerLevelController {
  @RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
  handler(): void {}
}

@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
class HandlerAndClassController {
  @RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
  handler(): void {}
}

function createExecutionContext(
  handler: () => void,
  target: new () => object
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => target,
    getArgs: vi.fn(),
    getArgByIndex: vi.fn(),
    switchToRpc: vi.fn(),
    switchToHttp: vi.fn(),
    switchToWs: vi.fn(),
    getType: vi.fn(),
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard', () => {
  let guard: FeatureFlagGuard;
  let featureFlagsService: { isEnabled: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    featureFlagsService = { isEnabled: vi.fn() };
    guard = new FeatureFlagGuard(
      new Reflector(),
      featureFlagsService as unknown as FeatureFlagsService
    );
  });

  it('returns true and skips the flag check when neither handler nor class carry metadata', async () => {
    const context = createExecutionContext(
      NoMetadataController.prototype.handler,
      NoMetadataController
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(featureFlagsService.isEnabled).not.toHaveBeenCalled();
  });

  it('reads class-level metadata and allows access when the flag is enabled', async () => {
    const context = createExecutionContext(
      ClassLevelController.prototype.handler,
      ClassLevelController
    );
    featureFlagsService.isEnabled.mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith(
      FEATURE_FLAG_KEYS.AI_ENABLED
    );
  });

  it('reads class-level metadata and forbids access when the flag is disabled', async () => {
    const context = createExecutionContext(
      ClassLevelController.prototype.handler,
      ClassLevelController
    );
    featureFlagsService.isEnabled.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      "Feature 'ai_enabled' is not enabled"
    );
  });

  it('reads handler-level metadata and allows access when the flag is enabled', async () => {
    const context = createExecutionContext(
      HandlerLevelController.prototype.handler,
      HandlerLevelController
    );
    featureFlagsService.isEnabled.mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith(
      FEATURE_FLAG_KEYS.AI_ENABLED
    );
  });

  it('reads handler-level metadata and forbids access when the flag is disabled', async () => {
    const context = createExecutionContext(
      HandlerLevelController.prototype.handler,
      HandlerLevelController
    );
    featureFlagsService.isEnabled.mockResolvedValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      "Feature 'ai_enabled' is not enabled"
    );
  });

  it('merges handler and class metadata, checking the flag once per merged entry', async () => {
    const context = createExecutionContext(
      HandlerAndClassController.prototype.handler,
      HandlerAndClassController
    );
    featureFlagsService.isEnabled.mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(featureFlagsService.isEnabled).toHaveBeenCalledTimes(2);
    expect(featureFlagsService.isEnabled).toHaveBeenNthCalledWith(
      1,
      FEATURE_FLAG_KEYS.AI_ENABLED
    );
    expect(featureFlagsService.isEnabled).toHaveBeenNthCalledWith(
      2,
      FEATURE_FLAG_KEYS.AI_ENABLED
    );
  });
});
