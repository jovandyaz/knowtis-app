import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { APICallError, RetryError } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiProvidersController } from './ai-providers.controller';
import { UserScopedThrottlerGuard } from './guards/user-scoped-throttler.guard';
import { ProviderNotConfiguredError } from './infrastructure/providers/provider-registry.factory';

// Only the call is stubbed; the error classes must stay real because the
// classifier reads the SDK's own retryability verdict off them.
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}));

const user = { id: 'admin-1' } as never;

function apiCallError(statusCode: number, message = 'nope') {
  return new APICallError({
    message,
    url: 'https://provider.test/v1',
    requestBodyValues: {},
    statusCode,
  });
}
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
        await probeFailsWith(apiCallError(statusCode));
        const { controller, systemKeys } = make();

        await expect(
          controller.set(user, anthropic, { apiKey: 'sk-ant-bad' })
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(systemKeys.setKey).not.toHaveBeenCalled();
      }
    );

    // A 503 would be truer but the global filter masks 5xx bodies, so the
    // reason has to ride a 4xx to reach the admin at all.
    it('should keep an outage distinguishable from a bad key in the response', async () => {
      await probeFailsWith(
        new RetryError({
          message: 'Failed after 3 attempts',
          reason: 'maxRetriesExceeded',
          errors: [apiCallError(503)],
        })
      );
      const { controller, systemKeys } = make();

      const error = await controller
        .set(user, anthropic, { apiKey: 'sk-ant-good' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.getResponse()).toMatchObject({
        code: 'unavailable',
        message: expect.stringContaining('unavailable'),
      });
      expect(systemKeys.setKey).not.toHaveBeenCalled();
    });

    it.each([
      ['a timeout', new DOMException('timed out', 'TimeoutError')],
      [
        'an unreachable host',
        Object.assign(new Error('getaddrinfo ENOTFOUND'), {
          code: 'ENOTFOUND',
        }),
      ],
    ])('should not blame the key for %s', async (_label, error) => {
      await probeFailsWith(error);
      const { controller, systemKeys } = make();

      const thrown = await controller
        .set(user, anthropic, { apiKey: 'sk-ant-good' })
        .catch((e) => e);

      expect(thrown.getResponse()).toMatchObject({ code: 'unavailable' });
      expect(systemKeys.setKey).not.toHaveBeenCalled();
    });

    it('should keep the submitted key out of the error the provider echoes back', async () => {
      await probeFailsWith(
        apiCallError(401, 'Incorrect API key provided: sk-ant-secret-value.')
      );
      const { controller } = make();

      const thrown = await controller
        .set(user, anthropic, { apiKey: 'sk-ant-secret-value' })
        .catch((e) => e);

      const body = JSON.stringify(thrown.getResponse());
      expect(body).not.toContain('sk-ant-secret-value');
      expect(body).toContain('[redacted]');
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
      await probeFailsWith(apiCallError(400, 'Your credit balance is too low'));
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
        await probeFailsWith(apiCallError(statusCode));
        const { controller } = make();

        await expect(controller.test(anthropic)).resolves.toMatchObject({
          ok: false,
          reason: 'rejected',
        });
      }
    );

    // The SDK retries 429/5xx to exhaustion and rethrows a RetryError, which
    // carries no statusCode — reading one off the error would classify these as
    // refusals and tell the admin to fix a key that is fine.
    it.each([429, 500, 503])(
      'should treat HTTP %i as transient after the SDK exhausts its retries',
      async (statusCode) => {
        await probeFailsWith(
          new RetryError({
            message: `Failed after 3 attempts`,
            reason: 'maxRetriesExceeded',
            errors: [apiCallError(statusCode)],
          })
        );
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
