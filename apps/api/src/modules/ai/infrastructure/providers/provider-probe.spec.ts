import { generateText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  probeProviderKey,
  VALIDATION_MAX_OUTPUT_TOKENS,
} from './provider-probe';

vi.mock('ai', () => ({ generateText: vi.fn() }));

const registry = { languageModel: vi.fn().mockReturnValue('probe-model') };

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
      new Error('Incorrect API key provided: sk-ant-secret-value.')
    );

    const result = await probeProviderKey(
      registry as never,
      'anthropic',
      'sk-ant-secret-value'
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('[redacted]');
    expect(result.error).not.toContain('sk-ant-secret-value');
  });

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
      error: 'The operation was aborted due to timeout',
    });
  });

  it('should label a non-Error throw as unknown', async () => {
    vi.mocked(generateText).mockRejectedValue('boom');

    await expect(
      probeProviderKey(registry as never, 'openai', 'sk-openai-key')
    ).resolves.toEqual({ valid: false, error: 'unknown' });
  });
});
