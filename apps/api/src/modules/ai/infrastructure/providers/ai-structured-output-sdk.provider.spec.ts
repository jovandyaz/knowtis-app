import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createMockConfig } from '../../testing/create-mock-config';
import { createTestChain } from '../../testing/create-test-chain';
import { AIStructuredOutputSDKProvider } from './ai-structured-output-sdk.provider';

const { languageModel } = vi.hoisted(() => ({
  languageModel: vi.fn().mockReturnValue('mock-model'),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn((value) => value) },
  createProviderRegistry: vi.fn(() => ({ languageModel })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(),
}));

const schema = z.object({ answer: z.number() });

function createProvider(config = createMockConfig()) {
  const { registry, chain } = createTestChain(config);
  return new AIStructuredOutputSDKProvider(registry, chain);
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
        metadata: { userId: 'user-1', environment: 'test' },
      },
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'artifact:generate_quiz',
          metadata: { userId: 'user-1', environment: 'test' },
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
      'anthropic:claude-haiku-4-5-20251001'
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
    const provider = createProvider(
      createMockConfig({ AI_FALLBACK_CHAIN: '' })
    );

    await expect(
      provider.generateStructuredOutput('prompt', schema, {
        model: 'anthropic:claude-sonnet-4-20250514',
      })
    ).rejects.toThrow('down');
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('should throw when an anthropic model is requested without ANTHROPIC_API_KEY', async () => {
    const provider = createProvider(
      createMockConfig({ ANTHROPIC_API_KEY: '', AI_FALLBACK_CHAIN: '' })
    );

    await expect(
      provider.generateStructuredOutput('prompt', schema, {
        model: 'anthropic:claude-sonnet-4-20250514',
      })
    ).rejects.toThrow('ANTHROPIC_API_KEY is not configured');
  });
});
