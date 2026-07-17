import {
  BadRequestException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiProvidersController } from './ai-providers.controller';
import { UserScopedThrottlerGuard } from './guards/user-scoped-throttler.guard';
import { ProviderNotConfiguredError } from './infrastructure/providers/provider-registry.factory';

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
      'should refuse to store a key the provider answers %i to',
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

  describe('test connection', () => {
    it('should probe the key that currently routes, not a candidate', async () => {
      const { generateText } = vi.mocked(await import('ai'));
      const { controller, registry } = make();

      const result = await controller.test(anthropic);

      expect(registry.languageModel).toHaveBeenCalledWith(
        expect.stringContaining('anthropic:'),
        undefined
      );
      expect(generateText).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        ok: true,
        model: expect.stringContaining('anthropic:'),
      });
    });

    // A failed probe is the answer the caller asked for. Throwing would hand it
    // to the global filter, which masks 5xx bodies to 'Internal server error'.
    it('should resolve with the failure instead of throwing', async () => {
      await probeFailsWith(new DOMException('timed out', 'TimeoutError'));
      const { controller } = make();

      await expect(controller.test(anthropic)).resolves.toEqual({
        ok: false,
        reason: 'unavailable',
        message: expect.stringContaining('unavailable'),
      });
    });

    it.each([
      ['no usable key', "No key for 'anthropic'"],
      ['a disabled provider', "Provider 'anthropic' is disabled"],
    ])('should report %s as unconfigured', async (_label, message) => {
      const { controller, registry } = make();
      registry.languageModel.mockImplementation(() => {
        throw new ProviderNotConfiguredError(message);
      });

      await expect(controller.test(anthropic)).resolves.toEqual({
        ok: false,
        reason: 'unconfigured',
        message,
      });
    });

    it('should carry the provider’s own words when it refuses', async () => {
      // The observed case: a valid key on an unfunded account answers 400.
      await probeFailsWith(
        Object.assign(new Error('Your credit balance is too low'), {
          statusCode: 400,
        })
      );
      const { controller } = make();

      const result = await controller.test(anthropic);

      expect(result).toMatchObject({ ok: false, reason: 'rejected' });
      expect(result.ok === false && result.message).toContain(
        'credit balance is too low'
      );
    });

    it.each([401, 403, 400, 404])(
      'should treat HTTP %i as a refusal the admin must act on',
      async (statusCode) => {
        await probeFailsWith(Object.assign(new Error('nope'), { statusCode }));
        const { controller } = make();

        await expect(controller.test(anthropic)).resolves.toMatchObject({
          ok: false,
          reason: 'rejected',
        });
      }
    );

    it.each([429, 500, 503])(
      'should treat HTTP %i as transient',
      async (statusCode) => {
        await probeFailsWith(Object.assign(new Error('busy'), { statusCode }));
        const { controller } = make();

        await expect(controller.test(anthropic)).resolves.toMatchObject({
          ok: false,
          reason: 'unavailable',
        });
      }
    );
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
