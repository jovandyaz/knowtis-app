import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockConfig } from '../../testing/create-mock-config';
import { createTestChain } from '../../testing/create-test-chain';
import { AISDKProvider } from './ai-sdk.provider';

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'Generated text',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  }),
  streamText: vi.fn().mockImplementation(() => ({
    textStream: (async function* () {
      yield 'Hello';
      yield ' world';
    })(),
    usage: Promise.resolve({
      inputTokens: 80,
      outputTokens: 30,
      totalTokens: 110,
    }),
  })),
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

function createProvider(
  config = createMockConfig({ OPENAI_API_KEY: 'test-openai-key' })
) {
  const { registry, chain } = createTestChain(config);
  return new AISDKProvider(registry, chain);
}

async function drain(stream: { textStream: AsyncIterable<string> }) {
  for await (const chunk of stream.textStream) {
    void chunk;
  }
}

describe('AISDKProvider', () => {
  let provider: AISDKProvider;

  beforeEach(() => {
    provider = createProvider();
  });

  it('should generate a completion via registry', async () => {
    const result = await provider.generateCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
    });
    expect(result.text).toBe('Generated text');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it('should fall back through the chain when the primary fails', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);
    mockedGenerateText
      .mockRejectedValueOnce(new Error('Primary model unavailable'))
      .mockResolvedValueOnce({
        text: 'Fallback text',
        usage: { inputTokens: 50, outputTokens: 20 },
      } as Awaited<ReturnType<typeof generateText>>);

    const fallbackProvider = createProvider();

    const result = await fallbackProvider.generateCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
    });
    expect(result.text).toBe('Fallback text');
    expect(result.model).toBe('anthropic:claude-haiku-4-5-20251001');
  });

  it('should throw when the chain has no other candidates', async () => {
    const { generateText } = await import('ai');
    const mockedGenerateText = vi.mocked(generateText);
    mockedGenerateText.mockRejectedValueOnce(new Error('Model unavailable'));

    const sameModelProvider = createProvider(
      createMockConfig({
        OPENAI_API_KEY: 'test-openai-key',
        AI_FALLBACK_CHAIN: '',
      })
    );

    await expect(
      sameModelProvider.generateCompletion('test prompt', {
        model: 'anthropic:claude-sonnet-4-20250514',
      })
    ).rejects.toThrow('Model unavailable');
  });

  it('should add Anthropic cache control to system prompt for streaming', async () => {
    const { streamText } = vi.mocked(await import('ai'));

    await drain(
      provider.streamCompletion('test prompt', {
        model: 'anthropic:claude-sonnet-4-20250514',
        system: 'You are a helpful assistant.',
      })
    );

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

  it('should forward telemetry context to streamText and generateText', async () => {
    const { streamText, generateText } = vi.mocked(await import('ai'));
    const telemetry = {
      functionId: 'completion:summarize',
      metadata: { userId: 'user-1', environment: 'test' },
    };

    await drain(
      provider.streamCompletion('test prompt', {
        model: 'anthropic:claude-sonnet-4-20250514',
        telemetry,
      })
    );
    await provider.generateCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
      telemetry,
    });

    const expected = expect.objectContaining({
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: 'completion:summarize',
        metadata: { userId: 'user-1', environment: 'test' },
      },
    });
    expect(streamText).toHaveBeenCalledWith(expected);
    expect(generateText).toHaveBeenCalledWith(expected);
  });

  it('should omit telemetry from the SDK call when not provided', async () => {
    const { generateText } = vi.mocked(await import('ai'));

    await provider.generateCompletion('test prompt', {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    const lastCall = vi.mocked(generateText).mock.calls.at(-1)?.[0];
    expect(lastCall).not.toHaveProperty('experimental_telemetry');
  });

  it('should pass plain system string for non-Anthropic models', async () => {
    const { streamText } = vi.mocked(await import('ai'));

    await drain(
      provider.streamCompletion('test prompt', {
        model: 'openai:gpt-4o',
        system: 'You are a helpful assistant.',
      })
    );

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

    await drain(
      provider.streamCompletion('test prompt', {
        model: 'anthropic:claude-sonnet-4-20250514',
        timeout: { totalMs: 30000, chunkMs: 10000 },
      })
    );

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: { totalMs: 30000, chunkMs: 10000 },
      })
    );
  });

  it('should forward only totalMs when chunkMs is absent', async () => {
    const { streamText } = vi.mocked(await import('ai'));
    streamText.mockClear();

    await drain(
      provider.streamCompletion('test prompt', {
        model: 'anthropic:claude-sonnet-4-20250514',
        timeout: { totalMs: 30000 },
      })
    );

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: { totalMs: 30000 } })
    );
  });

  it('should forward only chunkMs when totalMs is absent', async () => {
    const { streamText } = vi.mocked(await import('ai'));
    streamText.mockClear();

    await drain(
      provider.streamCompletion('test prompt', {
        model: 'anthropic:claude-sonnet-4-20250514',
        timeout: { chunkMs: 10000 },
      })
    );

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: { chunkMs: 10000 } })
    );
  });

  it('should not pass a timeout when none is provided', async () => {
    const { streamText } = vi.mocked(await import('ai'));
    streamText.mockClear();

    await drain(
      provider.streamCompletion('test prompt', {
        model: 'anthropic:claude-sonnet-4-20250514',
      })
    );

    expect(streamText).toHaveBeenCalledWith(
      expect.not.objectContaining({ timeout: expect.anything() })
    );
  });

  it('should fall back through the chain when the stream fails before the first chunk', async () => {
    const { streamText } = vi.mocked(await import('ai'));
    streamText.mockClear();

    streamText
      .mockReturnValueOnce({
        // eslint-disable-next-line require-yield -- mock: stream that fails before first chunk
        textStream: (async function* () {
          throw new Error('Primary model unavailable');
        })(),
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      } as unknown as ReturnType<typeof streamText>)
      .mockReturnValueOnce({
        textStream: (async function* () {
          yield 'recovered';
        })(),
        usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      } as unknown as ReturnType<typeof streamText>);

    const fallbackProvider = createProvider();

    const stream = fallbackProvider.streamCompletion('p', {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    const chunks: string[] = [];
    for await (const c of stream.textStream) {
      chunks.push(c);
    }

    expect(chunks).toEqual(['recovered']);
    expect(streamText).toHaveBeenCalledTimes(2);
  });

  it('should NOT fall back once a chunk has already been emitted', async () => {
    const { streamText } = vi.mocked(await import('ai'));
    streamText.mockClear();

    streamText.mockReturnValueOnce({
      textStream: (async function* () {
        yield 'partial';
        throw new Error('mid-stream failure');
      })(),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    } as unknown as ReturnType<typeof streamText>);

    const provider2 = createProvider();

    const stream = provider2.streamCompletion('p', {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    const received: string[] = [];
    await expect(
      (async () => {
        for await (const c of stream.textStream) {
          received.push(c);
        }
      })()
    ).rejects.toThrow('mid-stream failure');
    expect(received).toEqual(['partial']);
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it('should settle usage when the consumer breaks out of the stream', async () => {
    const { streamText } = vi.mocked(await import('ai'));
    streamText.mockClear();

    streamText.mockReturnValueOnce({
      textStream: (async function* () {
        yield 'first';
        await new Promise(() => undefined);
      })(),
      usage: Promise.resolve({ inputTokens: 12, outputTokens: 3 }),
    } as unknown as ReturnType<typeof streamText>);

    const stream = provider.streamCompletion('p', {
      model: 'anthropic:claude-sonnet-4-20250514',
    });

    for await (const chunk of stream.textStream) {
      expect(chunk).toBe('first');
      break;
    }

    const usage = await stream.usage;
    expect(usage.promptTokens).toBe(12);
    expect(usage.completionTokens).toBe(3);
  });

  it('should settle usage with zeros when the SDK never resolves it after a break', async () => {
    vi.useFakeTimers();
    try {
      const { streamText } = vi.mocked(await import('ai'));
      streamText.mockClear();

      streamText.mockReturnValueOnce({
        textStream: (async function* () {
          yield 'first';
          await new Promise(() => undefined);
        })(),
        usage: new Promise(() => undefined),
      } as unknown as ReturnType<typeof streamText>);

      const stream = provider.streamCompletion('p', {
        model: 'anthropic:claude-sonnet-4-20250514',
      });

      for await (const chunk of stream.textStream) {
        expect(chunk).toBe('first');
        break;
      }

      await vi.advanceTimersByTimeAsync(2000);
      const usage = await stream.usage;
      expect(usage.promptTokens).toBe(0);
      expect(usage.completionTokens).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should forward the abort signal to streamText', async () => {
    const { streamText } = vi.mocked(await import('ai'));
    streamText.mockClear();

    const controller = new AbortController();
    await drain(
      provider.streamCompletion('p', {
        model: 'anthropic:claude-sonnet-4-20250514',
        signal: controller.signal,
      })
    );

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal })
    );
  });

  it('should not fall back to another model when the stream was aborted', async () => {
    const { streamText } = vi.mocked(await import('ai'));
    streamText.mockClear();

    const controller = new AbortController();
    streamText.mockReturnValueOnce({
      // eslint-disable-next-line require-yield -- mock: stream aborted before first chunk
      textStream: (async function* () {
        controller.abort();
        throw new Error('aborted');
      })(),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    } as unknown as ReturnType<typeof streamText>);

    const fallbackProvider = createProvider();

    const stream = fallbackProvider.streamCompletion('p', {
      model: 'anthropic:claude-sonnet-4-20250514',
      signal: controller.signal,
    });

    await expect(
      (async () => {
        for await (const chunk of stream.textStream) {
          void chunk;
        }
      })()
    ).rejects.toThrow('aborted');
    expect(streamText).toHaveBeenCalledTimes(1);
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
