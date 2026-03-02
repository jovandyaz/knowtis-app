import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
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

type TypedConfigService = ConfigService<EnvConfig, true>;

describe('AISDKProvider', () => {
  let provider: AISDKProvider;

  beforeEach(() => {
    const mockConfig = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          OPENAI_API_KEY: '',
        };
        return config[key] ?? '';
      }),
    } as unknown as TypedConfigService;

    provider = new AISDKProvider(mockConfig);
    provider.onModuleInit();
  });

  it('should generate a completion via registry', async () => {
    const result = await provider.generateCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-5-20250929',
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

    const mockConfig = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          OPENAI_API_KEY: '',
          AI_FALLBACK_MODEL: 'anthropic:claude-haiku-4-5-20251001',
        };
        return config[key] ?? '';
      }),
    } as unknown as TypedConfigService;

    const fallbackProvider = new AISDKProvider(mockConfig);
    fallbackProvider.onModuleInit();

    const result = await fallbackProvider.generateCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-5-20250929',
    });
    expect(result.text).toBe('Fallback text');
    expect(result.model).toBe('anthropic:claude-haiku-4-5-20251001');
  });

  it('should throw when primary fails and fallback is same model', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);
    mockedGenerateText.mockRejectedValueOnce(new Error('Model unavailable'));

    const mockConfig = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          OPENAI_API_KEY: '',
          AI_FALLBACK_MODEL: 'anthropic:claude-sonnet-4-5-20250929',
        };
        return config[key] ?? '';
      }),
    } as unknown as TypedConfigService;

    const sameModelProvider = new AISDKProvider(mockConfig);
    sameModelProvider.onModuleInit();

    await expect(
      sameModelProvider.generateCompletion('test prompt', {
        model: 'anthropic:claude-sonnet-4-5-20250929',
      })
    ).rejects.toThrow('Model unavailable');
  });

  it('should stream a completion via registry', async () => {
    const streamResult = provider.streamCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-5-20250929',
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
