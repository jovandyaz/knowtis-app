import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createMockConfig } from '../../testing/create-mock-config';
import { createTestChain } from '../../testing/create-test-chain';
import { AIStructuredOutputSDKProvider } from './ai-structured-output-sdk.provider';
import type { OpenRouterRoutingSource } from './openrouter-options';

const { languageModel } = vi.hoisted(() => ({
  languageModel: vi.fn().mockReturnValue('mock-model'),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn((value) => value) },
  createProviderRegistry: vi.fn(() => ({ languageModel })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn()),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogle: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(),
}));

const schema = z.object({ answer: z.number() });
const OPENROUTER_MODEL = 'openrouter:minimax/minimax-m3';

function createRoutingSource(
  providerOrder: readonly string[] = []
): OpenRouterRoutingSource {
  return { getOpenRouterProviderOrder: async () => providerOrder };
}

function createProvider(
  config = createMockConfig(),
  fallbackChain?: string,
  providerOrder?: readonly string[]
) {
  const { registry, chain } = createTestChain(config, fallbackChain);
  return new AIStructuredOutputSDKProvider(
    registry,
    chain,
    createRoutingSource(providerOrder)
  );
}

describe('AIStructuredOutputSDKProvider', () => {
  beforeEach(async () => {
    const { generateText } = vi.mocked(await import('ai'));
    generateText.mockReset();
    generateText.mockResolvedValue({
      output: { answer: 42 },
      usage: { inputTokens: 10, outputTokens: 5 },
    } as unknown as Awaited<ReturnType<typeof generateText>>);
    languageModel.mockClear();
  });

  it('should hand the fallback scope to the chain resolver', async () => {
    const { registry, chain } = createTestChain(createMockConfig());
    const spy = vi.spyOn(chain, 'candidatesFor');
    const provider = new AIStructuredOutputSDKProvider(
      registry,
      chain,
      createRoutingSource()
    );

    await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
      fallbackScope: 'same-family',
    });

    expect(spy).toHaveBeenCalledWith(
      'anthropic:claude-sonnet-4-20250514',
      'same-family'
    );
  });

  it('should forward a zero temperature rather than drop it as falsy', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    const provider = createProvider();

    await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
      temperature: 0,
    });

    expect(generateText.mock.calls[0]?.[0]).toMatchObject({ temperature: 0 });
  });

  it('should leave temperature to the provider when none is asked for', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    const provider = createProvider();

    await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    expect(generateText.mock.calls[0]?.[0]).not.toHaveProperty('temperature');
  });

  it('should keep an OpenRouter call off upstreams that would ignore the schema', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    const provider = createProvider(
      createMockConfig({ OPENROUTER_API_KEY: 'test-key' }),
      OPENROUTER_MODEL
    );

    await provider.generateStructuredOutput('prompt', schema, {
      model: OPENROUTER_MODEL,
    });

    expect(generateText.mock.calls[0]?.[0]).toMatchObject({
      providerOptions: {
        openrouter: { provider: { require_parameters: true } },
      },
    });
  });

  it("should hand OpenRouter the operator's vetted upstream order", async () => {
    const { generateText } = vi.mocked(await import('ai'));
    const provider = createProvider(
      createMockConfig({ OPENROUTER_API_KEY: 'test-key' }),
      OPENROUTER_MODEL,
      ['fireworks', 'baseten']
    );

    await provider.generateStructuredOutput('prompt', schema, {
      model: OPENROUTER_MODEL,
    });

    expect(generateText.mock.calls[0]?.[0]).toMatchObject({
      providerOptions: {
        openrouter: {
          provider: {
            order: ['fireworks', 'baseten'],
            allow_fallbacks: true,
            require_parameters: true,
          },
        },
      },
    });
  });

  it('should route the fallback candidate, not just the model first asked for', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    generateText.mockRejectedValueOnce(new Error('primary down'));
    const provider = createProvider(
      createMockConfig({ OPENROUTER_API_KEY: 'test-key' }),
      `anthropic:claude-sonnet-4-20250514,${OPENROUTER_MODEL}`,
      ['fireworks']
    );

    await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    expect(languageModel).toHaveBeenLastCalledWith(OPENROUTER_MODEL);
    expect(generateText.mock.calls[0]?.[0]).not.toHaveProperty(
      'providerOptions'
    );
    expect(generateText.mock.calls[1]?.[0]).toMatchObject({
      providerOptions: {
        openrouter: {
          provider: { order: ['fireworks'], require_parameters: true },
        },
      },
    });
  });

  it('should not send OpenRouter routing to a direct-provider model', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    const provider = createProvider(createMockConfig(), undefined, [
      'fireworks',
    ]);

    await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    expect(generateText.mock.calls[0]?.[0]).not.toHaveProperty(
      'providerOptions'
    );
  });

  it('should generate structured output via the registry', async () => {
    const provider = createProvider();

    const result = await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    expect(result.object).toEqual({ answer: 42 });
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(languageModel).toHaveBeenCalledWith(
      'anthropic:claude-sonnet-4-20250514'
    );
  });

  it('should forward telemetry context to generateText', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    const provider = createProvider();

    await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
      telemetry: {
        functionId: 'artifact:generate_quiz',
        userId: 'user-1',
      },
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        telemetry: {
          isEnabled: true,
          recordInputs: false,
          recordOutputs: false,
          functionId: 'artifact:generate_quiz',
        },
      })
    );
  });

  it('should redact content when the caller provides no telemetry', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    const provider = createProvider();

    await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        telemetry: {
          isEnabled: true,
          recordInputs: false,
          recordOutputs: false,
          functionId: 'structured-output',
        },
      })
    );
  });

  it('should retry with AI_FALLBACK_MODEL when the primary fails', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    generateText.mockRejectedValueOnce(new Error('primary down'));
    const provider = createProvider();

    const result = await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    expect(result.object).toEqual({ answer: 42 });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(languageModel).toHaveBeenLastCalledWith(
      'anthropic:claude-haiku-4-5'
    );
  });

  it('should rethrow an AbortError without falling back', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    generateText.mockRejectedValueOnce(
      new DOMException('aborted', 'AbortError')
    );
    const provider = createProvider();

    await expect(
      provider.generateStructuredOutput('prompt', schema, {
        model: 'anthropic:claude-sonnet-4-20250514',
      })
    ).rejects.toThrow('aborted');
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('should rethrow when the chain has no other candidates', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    generateText.mockRejectedValueOnce(new Error('down'));
    const provider = createProvider(createMockConfig(), '');

    await expect(
      provider.generateStructuredOutput('prompt', schema, {
        model: 'anthropic:claude-sonnet-4-20250514',
      })
    ).rejects.toThrow('down');
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('should throw when an anthropic model is requested without ANTHROPIC_API_KEY', async () => {
    const provider = createProvider(
      createMockConfig({ ANTHROPIC_API_KEY: '' }),
      ''
    );

    await expect(
      provider.generateStructuredOutput('prompt', schema, {
        model: 'anthropic:claude-sonnet-4-20250514',
      })
    ).rejects.toThrow("No key for 'anthropic'");
  });
});

describe('AIStructuredOutputSDKProvider timeout handling', () => {
  beforeEach(async () => {
    const { generateText } = vi.mocked(await import('ai'));
    generateText.mockReset();
    languageModel.mockClear();
  });

  it('should give each fallback attempt a distinct, non-shared abort signal', async () => {
    const { generateText } = vi.mocked(await import('ai'));
    const seenSignals: (AbortSignal | undefined)[] = [];

    generateText
      .mockImplementationOnce((options) => {
        seenSignals.push(options.abortSignal);
        const error = new Error('timed out');
        error.name = 'TimeoutError';
        return Promise.reject(error);
      })
      .mockImplementationOnce((options) => {
        seenSignals.push(options.abortSignal);
        return Promise.resolve({
          output: { answer: 42 },
          usage: { inputTokens: 1, outputTokens: 1 },
        } as unknown as Awaited<ReturnType<typeof generateText>>);
      });

    const provider = createProvider();
    const result = await provider.generateStructuredOutput('prompt', schema, {
      model: 'anthropic:claude-sonnet-4-20250514',
      timeoutMs: 5_000,
    });

    expect(result.model).toBe('anthropic:claude-haiku-4-5');
    expect(seenSignals).toHaveLength(2);
    expect(seenSignals[0]).not.toBe(seenSignals[1]);
    expect(seenSignals[1]?.aborted).toBe(false);
  });
});
