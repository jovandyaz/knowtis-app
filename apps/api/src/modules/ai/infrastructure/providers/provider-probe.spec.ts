import { APICallError, generateText, RetryError } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PROBE_TIMEOUT_MS,
  probeProviderKey,
  VALIDATION_MAX_OUTPUT_TOKENS,
} from './provider-probe';

// Only the call is stubbed; the error classes must stay real because the
// classifier reads the SDK's own retryability verdict off them.
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}));

const PROBE_MODEL = 'anthropic:claude-haiku-4-5';

const registry = { languageModel: vi.fn().mockReturnValue('probe-model') };

function apiCallError(statusCode: number, message = 'nope') {
  return new APICallError({
    message,
    url: 'https://provider.test/v1',
    requestBodyValues: {},
    statusCode,
  });
}

describe('probeProviderKey', () => {
  beforeEach(() => {
    vi.mocked(generateText)
      .mockReset()
      .mockResolvedValue({} as never);
    registry.languageModel.mockClear();
  });

  it('should send one bounded turn through the given model built from the candidate key', async () => {
    const result = await probeProviderKey(
      registry as never,
      'anthropic',
      'sk-ant-candidate',
      PROBE_MODEL
    );

    expect(result).toEqual({ valid: true });
    expect(registry.languageModel).toHaveBeenCalledWith(
      PROBE_MODEL,
      'sk-ant-candidate'
    );
    expect(vi.mocked(generateText).mock.calls[0][0].maxOutputTokens).toBe(
      VALIDATION_MAX_OUTPUT_TOKENS
    );
  });

  it('should report a refusal with the candidate key scrubbed from the provider echo', async () => {
    vi.mocked(generateText).mockRejectedValue(
      apiCallError(401, 'Incorrect API key provided: sk-ant-secret-value.')
    );

    const result = await probeProviderKey(
      registry as never,
      'anthropic',
      'sk-ant-secret-value',
      PROBE_MODEL
    );

    expect(result).toEqual({
      valid: false,
      reason: 'rejected',
      error: 'Incorrect API key provided: [redacted].',
    });
  });

  it.each([400, 401, 403, 404])(
    'should classify HTTP %i as a definitive refusal',
    async (statusCode) => {
      vi.mocked(generateText).mockRejectedValue(apiCallError(statusCode));

      await expect(
        probeProviderKey(
          registry as never,
          'anthropic',
          'sk-ant-candidate',
          PROBE_MODEL
        )
      ).resolves.toMatchObject({ valid: false, reason: 'rejected' });
    }
  );

  // The SDK retries 429/5xx to exhaustion and rethrows a RetryError, which
  // carries no statusCode — the key may well be fine.
  it.each([429, 500, 503])(
    'should classify HTTP %i as unavailable after the SDK exhausts its retries',
    async (statusCode) => {
      vi.mocked(generateText).mockRejectedValue(
        new RetryError({
          message: 'Failed after 3 attempts',
          reason: 'maxRetriesExceeded',
          errors: [apiCallError(statusCode)],
        })
      );

      await expect(
        probeProviderKey(
          registry as never,
          'anthropic',
          'sk-ant-candidate',
          PROBE_MODEL
        )
      ).resolves.toMatchObject({ valid: false, reason: 'unavailable' });
    }
  );

  it('should settle a hung request when its own time bound fires, as a timeout result', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(generateText).mockImplementation(
        ({ abortSignal }) =>
          new Promise((_, reject) => {
            abortSignal?.addEventListener('abort', () =>
              reject(abortSignal.reason)
            );
          }) as never
      );
      const pending = probeProviderKey(
        registry as never,
        'anthropic',
        'sk-ant-slow-provider',
        PROBE_MODEL
      );

      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS - 1);
      await expect(
        Promise.race([pending, Promise.resolve('still pending')])
      ).resolves.toBe('still pending');

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({
        valid: false,
        reason: 'timeout',
        error: 'The probe timed out',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should label a non-Error throw as unknown and unavailable', async () => {
    vi.mocked(generateText).mockRejectedValue('boom');

    await expect(
      probeProviderKey(
        registry as never,
        'openai',
        'sk-openai-key',
        PROBE_MODEL
      )
    ).resolves.toEqual({
      valid: false,
      reason: 'unavailable',
      error: 'unknown',
    });
  });

  it('should report unavailable without calling the provider when no model resolves', async () => {
    await expect(
      probeProviderKey(registry as never, 'openai', 'sk-openai-key', null)
    ).resolves.toEqual({
      valid: false,
      reason: 'unavailable',
      error: "No model resolves for provider 'openai'",
    });
    expect(generateText).not.toHaveBeenCalled();
    expect(registry.languageModel).not.toHaveBeenCalled();
  });
});
