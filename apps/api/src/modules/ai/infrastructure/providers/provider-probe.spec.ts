import { APICallError, generateText, RetryError } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  probeProviderKey,
  VALIDATION_MAX_OUTPUT_TOKENS,
} from './provider-probe';

// Only the call is stubbed; the error classes must stay real because the
// classifier reads the SDK's own retryability verdict off them.
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}));

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

  it('should send one bounded turn through a curated model built from the candidate key', async () => {
    const result = await probeProviderKey(
      registry as never,
      'anthropic',
      'sk-ant-candidate'
    );

    expect(result).toEqual({ valid: true });
    expect(registry.languageModel).toHaveBeenCalledWith(
      expect.stringContaining('anthropic:'),
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
      'sk-ant-secret-value'
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
        probeProviderKey(registry as never, 'anthropic', 'sk-ant-candidate')
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
        probeProviderKey(registry as never, 'anthropic', 'sk-ant-candidate')
      ).resolves.toMatchObject({ valid: false, reason: 'unavailable' });
    }
  );

  it('should bound the probe and map a timeout abort to a result, not a rejection', async () => {
    vi.mocked(generateText).mockImplementation(({ abortSignal }) => {
      // A hanging provider: the SDK settles only when the probe's own bound fires.
      expect(abortSignal).toBeInstanceOf(AbortSignal);
      return Promise.reject(
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError'
        )
      );
    });

    await expect(
      probeProviderKey(registry as never, 'anthropic', 'sk-ant-slow-provider')
    ).resolves.toEqual({
      valid: false,
      reason: 'timeout',
      error: 'The operation was aborted due to timeout',
    });
  });

  it('should label a non-Error throw as unknown and unavailable', async () => {
    vi.mocked(generateText).mockRejectedValue('boom');

    await expect(
      probeProviderKey(registry as never, 'openai', 'sk-openai-key')
    ).resolves.toEqual({
      valid: false,
      reason: 'unavailable',
      error: 'unknown',
    });
  });
});
