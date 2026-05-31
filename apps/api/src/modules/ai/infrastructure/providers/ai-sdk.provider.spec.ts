import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockConfig } from '../../testing/create-mock-config';
import { AISDKProvider } from './ai-sdk.provider';

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'Generated text',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  }),
  streamText: vi.fn().mockReturnValue({
    textStream: (async function* () {
      yield 'Hello';
      yield ' world';
    })(),
    usage: Promise.resolve({
      inputTokens: 80,
      outputTokens: 30,
      totalTokens: 110,
    }),
  }),
  createProviderRegistry: vi.fn().mockReturnValue({
    languageModel: vi.fn().mockReturnValue('mock-model'),
  }),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue('mock-anthropic'),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue('mock-openai'),
}));

describe('AISDKProvider', () => {
  let provider: AISDKProvider;

  beforeEach(() => {
    const mockConfig = createMockConfig();

    provider = new AISDKProvider(mockConfig);
    provider.onModuleInit();
  });

  it('should generate a completion via registry', async () => {
    const result = await provider.generateCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
    });
    expect(result.text).toBe('Generated text');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it('should fallback to AI_FALLBACK_MODEL when primary fails', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);
    mockedGenerateText
      .mockRejectedValueOnce(new Error('Primary model unavailable'))
      .mockResolvedValueOnce({
        text: 'Fallback text',
        usage: { inputTokens: 50, outputTokens: 20 },
      } as Awaited<ReturnType<typeof generateText>>);

    const fallbackConfig = createMockConfig({
      AI_FALLBACK_MODEL: 'anthropic:claude-haiku-4-5-20251001',
    });

    const fallbackProvider = new AISDKProvider(fallbackConfig);
    fallbackProvider.onModuleInit();

    const result = await fallbackProvider.generateCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
    });
    expect(result.text).toBe('Fallback text');
    expect(result.model).toBe('anthropic:claude-haiku-4-5-20251001');
  });

  it('should throw when primary fails and fallback is same model', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);
    mockedGenerateText.mockRejectedValueOnce(new Error('Model unavailable'));

    const sameModelConfig = createMockConfig({
      AI_FALLBACK_MODEL: 'anthropic:claude-sonnet-4-20250514',
    });

    const sameModelProvider = new AISDKProvider(sameModelConfig);
    sameModelProvider.onModuleInit();

    await expect(
      sameModelProvider.generateCompletion('test prompt', {
        model: 'anthropic:claude-sonnet-4-20250514',
      })
    ).rejects.toThrow('Model unavailable');
  });

  it('should add Anthropic cache control to system prompt for streaming', async () => {
    const { streamText } = vi.mocked(await import('ai'));

    provider.streamCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
      system: 'You are a helpful assistant.',
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: {
          role: 'system',
          content: 'You are a helpful assistant.',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
      })
    );
  });

  it('should pass plain system string for non-Anthropic models', async () => {
    const { streamText } = vi.mocked(await import('ai'));

    provider.streamCompletion('test prompt', {
      model: 'openai:gpt-4o',
      system: 'You are a helpful assistant.',
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'You are a helpful assistant.',
      })
    );
  });

  it('should add Anthropic cache control to system prompt for generateText', async () => {
    const { generateText } = vi.mocked(await import('ai'));

    await provider.generateCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
      system: 'You are a helpful assistant.',
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: {
          role: 'system',
          content: 'You are a helpful assistant.',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
      })
    );
  });

  it('should forward both totalMs and chunkMs timeouts to streamText', async () => {
    const { streamText } = vi.mocked(await import('ai'));

    provider.streamCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
      timeout: { totalMs: 30000, chunkMs: 10000 },
    });

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: { totalMs: 30000, chunkMs: 10000 },
      })
    );
  });

  it('should stream a completion via registry', async () => {
    const streamResult = provider.streamCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
    });
    const chunks: string[] = [];
    for await (const chunk of streamResult.textStream) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Hello', ' world']);

    const usage = await streamResult.usage;
    expect(usage.promptTokens).toBe(80);
    expect(usage.completionTokens).toBe(30);
  });
});
