import {
  BadRequestException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiProvidersController } from './ai-providers.controller';
import { UserScopedThrottlerGuard } from './guards/user-scoped-throttler.guard';

vi.mock('ai', () => ({ generateText: vi.fn() }));

const user = { id: 'admin-1' } as never;
const anthropic = { provider: 'anthropic' } as never;

function make() {
  const systemKeys = {
    list: vi.fn().mockResolvedValue([]),
    setKey: vi.fn().mockResolvedValue(undefined),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    clearKey: vi.fn().mockResolvedValue(undefined),
  };
  const registry = {
    languageModel: vi.fn().mockReturnValue('probe-model'),
    refreshSystemConfigs: vi.fn().mockResolvedValue(undefined),
  };
  return {
    controller: new AiProvidersController(
      systemKeys as never,
      registry as never
    ),
    systemKeys,
    registry,
  };
}

async function probeFailsWith(error: unknown) {
  const { generateText } = vi.mocked(await import('ai'));
  generateText.mockRejectedValueOnce(error);
}

describe('AiProvidersController', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { generateText } = vi.mocked(await import('ai'));
    generateText.mockResolvedValue({} as never);
  });

  it('should reject a request that changes nothing', async () => {
    const { controller, systemKeys } = make();

    await expect(controller.set(user, anthropic, {})).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(systemKeys.setKey).not.toHaveBeenCalled();
    expect(systemKeys.setEnabled).not.toHaveBeenCalled();
  });

  it('should store a key that the provider accepts', async () => {
    const { controller, systemKeys } = make();

    await controller.set(user, anthropic, { apiKey: 'sk-ant-good' });

    expect(systemKeys.setKey).toHaveBeenCalledWith(
      'anthropic',
      'sk-ant-good',
      'admin-1'
    );
  });

  it('should refresh routing before reporting what is applied', async () => {
    const { controller, registry, systemKeys } = make();

    await controller.set(user, anthropic, { enabled: false });

    expect(registry.refreshSystemConfigs).toHaveBeenCalled();
    expect(systemKeys.list.mock.invocationCallOrder[0]).toBeGreaterThan(
      registry.refreshSystemConfigs.mock.invocationCallOrder[0]
    );
  });

  describe('probe', () => {
    it('should bound the probe with an abort signal', async () => {
      const { generateText } = vi.mocked(await import('ai'));
      const { controller } = make();

      await controller.set(user, anthropic, { apiKey: 'sk-ant-good' });

      expect(generateText.mock.calls[0][0].abortSignal).toBeInstanceOf(
        AbortSignal
      );
    });

    it.each([401, 403])(
      'should reject the key when the provider answers %i',
      async (statusCode) => {
        await probeFailsWith(Object.assign(new Error('nope'), { statusCode }));
        const { controller, systemKeys } = make();

        await expect(
          controller.set(user, anthropic, { apiKey: 'sk-ant-bad' })
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(systemKeys.setKey).not.toHaveBeenCalled();
      }
    );

    it('should report an outage rather than a bad key when the provider errors', async () => {
      await probeFailsWith(
        Object.assign(new Error('boom'), { statusCode: 500 })
      );
      const { controller } = make();

      await expect(
        controller.set(user, anthropic, { apiKey: 'sk-ant-good' })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('should report an outage when the probe times out', async () => {
      // A timeout carries no statusCode; calling it a bad key would block an
      // emergency rotation.
      await probeFailsWith(new DOMException('timed out', 'TimeoutError'));
      const { controller, systemKeys } = make();

      await expect(
        controller.set(user, anthropic, { apiKey: 'sk-ant-good' })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(systemKeys.setKey).not.toHaveBeenCalled();
    });

    it('should report an outage when the provider is unreachable', async () => {
      await probeFailsWith(
        Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
      );
      const { controller } = make();

      await expect(
        controller.set(user, anthropic, { apiKey: 'sk-ant-good' })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('should not probe when only enablement changes', async () => {
      const { generateText } = vi.mocked(await import('ai'));
      const { controller, systemKeys } = make();

      await controller.set(user, anthropic, { enabled: false });

      expect(generateText).not.toHaveBeenCalled();
      expect(systemKeys.setEnabled).toHaveBeenCalledWith(
        'anthropic',
        false,
        'admin-1'
      );
    });
  });

  describe('throttling', () => {
    it('should scope every route to the authenticated user', () => {
      const guards: unknown[] =
        Reflect.getMetadata('__guards__', AiProvidersController) ?? [];

      expect(guards).toContain(UserScopedThrottlerGuard);
    });

    it.each(['list', 'set', 'clearKey'] as const)(
      'should throttle %s',
      (route) => {
        expect(
          Reflect.getMetadata(
            'THROTTLER:LIMITdefault',
            AiProvidersController.prototype[route]
          )
        ).toBeDefined();
      }
    );
  });
});
