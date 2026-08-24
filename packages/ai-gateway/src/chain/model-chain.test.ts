import { describe, expect, it, vi } from 'vitest';

import {
  cooldownKeyOf,
  executeWithChain,
  isOverloadedError,
  resolveChainCandidates,
  streamWithChain,
} from './model-chain';
import { ProviderCooldownTracker } from './provider-cooldown.tracker';

const logger = { warn: vi.fn(), error: vi.fn() };

describe('isOverloadedError', () => {
  it('detects a direct provider error with a 503 status', () => {
    expect(isOverloadedError({ statusCode: 503 })).toBe(true);
  });

  it('detects a direct provider error with a 429 status', () => {
    expect(isOverloadedError({ statusCode: 429 })).toBe(true);
  });

  it('unwraps a RetryError whose lastError is a 503', () => {
    expect(isOverloadedError({ lastError: { statusCode: 503 } })).toBe(true);
  });

  it('unwraps a RetryError whose errors array contains a 429', () => {
    expect(
      isOverloadedError({ errors: [{ statusCode: 500 }, { statusCode: 429 }] })
    ).toBe(true);
  });

  it('detects a 503 wrapped inside a nested errors array entry', () => {
    expect(
      isOverloadedError({ errors: [{ lastError: { statusCode: 503 } }] })
    ).toBe(true);
  });

  it('returns false for a non-transient status like 500', () => {
    expect(isOverloadedError({ statusCode: 500 })).toBe(false);
  });

  it('returns false for an abort error', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    expect(isOverloadedError(error)).toBe(false);
  });

  it('returns false for a plain error or non-object input', () => {
    expect(isOverloadedError(new Error('boom'))).toBe(false);
    expect(isOverloadedError(null)).toBe(false);
    expect(isOverloadedError('503')).toBe(false);
  });
});

const SONNET = 'anthropic:claude-sonnet-4-20250514';
const HAIKU = 'anthropic:claude-haiku-4-5-20251001';
const GPT = 'openai:gpt-4o-mini';
const GEMINI = 'google:gemini-2.0-flash';
const GLM = 'openrouter:z-ai/glm-5.2';
const MINIMAX = 'openrouter:minimax/minimax-m2.5';
const DEEPSEEK = 'openrouter:deepseek/deepseek-v3.2';

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

describe('cooldownKeyOf', () => {
  it('keys OpenRouter models individually so their failures do not collide', () => {
    expect(cooldownKeyOf(GLM)).toBe(GLM);
    expect(cooldownKeyOf(GLM)).not.toBe(cooldownKeyOf(MINIMAX));
  });

  it('keys direct providers by provider so their models share a bucket', () => {
    expect(cooldownKeyOf(SONNET)).toBe('anthropic');
    expect(cooldownKeyOf(HAIKU)).toBe('anthropic');
  });
});

describe('resolveChainCandidates', () => {
  it('puts the primary first and dedupes chain entries', () => {
    expect(
      resolveChainCandidates({
        primaryModel: SONNET,
        chain: [HAIKU, SONNET, GPT, HAIKU],
      })
    ).toEqual([SONNET, HAIKU, GPT]);
  });

  it('drops cross-provider chain entries when scoped to the same provider', () => {
    expect(
      resolveChainCandidates({
        primaryModel: SONNET,
        chain: [HAIKU, GPT, GEMINI],
        scope: 'same-provider',
      })
    ).toEqual([SONNET, HAIKU]);
  });

  it('still returns the primary when scoping empties the chain', () => {
    expect(
      resolveChainCandidates({
        primaryModel: SONNET,
        chain: [GPT, GEMINI],
        scope: 'same-provider',
      })
    ).toEqual([SONNET]);
  });

  it('skips models whose provider has no credentials', () => {
    expect(
      resolveChainCandidates({
        primaryModel: SONNET,
        chain: [HAIKU, GPT, GEMINI],
        isModelAvailable: (m) => !m.startsWith('google:'),
      })
    ).toEqual([SONNET, HAIKU, GPT]);
  });

  it('skips models from cooling providers', () => {
    const cooldown = new ProviderCooldownTracker(
      { allowedFails: 1, cooldownSeconds: 60 },
      undefined,
      () => 0
    );
    cooldown.recordFailure('anthropic');
    expect(
      resolveChainCandidates({
        primaryModel: SONNET,
        chain: [HAIKU, GPT],
        cooldown,
      })
    ).toEqual([GPT]);
  });

  it('never filters down to zero candidates', () => {
    const cooldown = new ProviderCooldownTracker(
      { allowedFails: 1, cooldownSeconds: 60 },
      undefined,
      () => 0
    );
    cooldown.recordFailure('anthropic');
    cooldown.recordFailure('openai');
    expect(
      resolveChainCandidates({
        primaryModel: SONNET,
        chain: [GPT],
        cooldown,
      })
    ).toEqual([SONNET, GPT]);

    expect(
      resolveChainCandidates({
        primaryModel: SONNET,
        chain: [GPT],
        isModelAvailable: () => false,
      })
    ).toEqual([SONNET, GPT]);
  });

  it('skips a cooling OpenRouter model without cooling its siblings', () => {
    const cooldown = new ProviderCooldownTracker(
      { allowedFails: 1, cooldownSeconds: 60 },
      undefined,
      () => 0
    );
    cooldown.recordFailure(GLM);
    expect(
      resolveChainCandidates({
        primaryModel: GLM,
        chain: [MINIMAX, DEEPSEEK],
        cooldown,
      })
    ).toEqual([MINIMAX, DEEPSEEK]);
  });
});

describe('executeWithChain', () => {
  it('returns the first successful attempt and records success', () => {
    const cooldown = {
      isCooling: vi.fn(),
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
    };
    const attempt = vi.fn().mockResolvedValue('ok');
    return executeWithChain(attempt, {
      candidates: [SONNET, GPT],
      logger,
      cooldown,
    }).then((result) => {
      expect(result).toBe('ok');
      expect(attempt).toHaveBeenCalledTimes(1);
      expect(attempt).toHaveBeenCalledWith(SONNET, { isLast: false });
      expect(cooldown.recordSuccess).toHaveBeenCalledWith('anthropic');
    });
  });

  it('advances through the chain on failure and records failures', async () => {
    const cooldown = {
      isCooling: vi.fn(),
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
    };
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error('anthropic down'))
      .mockRejectedValueOnce(new Error('openai down'))
      .mockResolvedValueOnce('gemini answer');

    const result = await executeWithChain(attempt, {
      candidates: [SONNET, GPT, GEMINI],
      logger,
      cooldown,
    });

    expect(result).toBe('gemini answer');
    expect(attempt).toHaveBeenNthCalledWith(3, GEMINI, { isLast: true });
    expect(cooldown.recordFailure).toHaveBeenCalledWith('anthropic');
    expect(cooldown.recordFailure).toHaveBeenCalledWith('openai');
    expect(cooldown.recordSuccess).toHaveBeenCalledWith('google');
  });

  it('rethrows the last error when every candidate fails', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('all down'));
    await expect(
      executeWithChain(attempt, { candidates: [SONNET, GPT], logger })
    ).rejects.toThrow('all down');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not advance the chain on abort', async () => {
    const attempt = vi.fn().mockRejectedValue(abortError());
    await expect(
      executeWithChain(attempt, { candidates: [SONNET, GPT], logger })
    ).rejects.toThrow('aborted');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('records an OpenRouter failure under the per-model key, not the shared provider', async () => {
    const cooldown = {
      isCooling: vi.fn(),
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
    };
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error('glm upstream flaky'))
      .mockResolvedValueOnce('minimax answer');

    const result = await executeWithChain(attempt, {
      candidates: [GLM, MINIMAX],
      logger,
      cooldown,
    });

    expect(result).toBe('minimax answer');
    expect(cooldown.recordFailure).toHaveBeenCalledWith(GLM);
    expect(cooldown.recordFailure).not.toHaveBeenCalledWith('openrouter');
    expect(cooldown.recordSuccess).toHaveBeenCalledWith(MINIMAX);
  });
});

async function* chunksOf(...values: string[]): AsyncGenerator<string> {
  for (const value of values) {
    yield value;
  }
}

async function* failAfter(value: string): AsyncGenerator<string> {
  yield value;
  throw new Error('mid-stream failure');
}

async function* failImmediately(): AsyncGenerator<string> {
  throw new Error('fresh failure');
  yield 'unreachable';
}

describe('streamWithChain', () => {
  it('streams from the first candidate when healthy', async () => {
    const received: string[] = [];
    const stream = streamWithChain<AsyncGenerator<string>, string>({
      candidates: [SONNET, GPT],
      logger,
      open: () => chunksOf('a', 'b'),
      chunks: (h) => h,
    });
    for await (const chunk of stream) {
      received.push(chunk);
    }
    expect(received).toEqual(['a', 'b']);
  });

  it('falls to the next candidate when the stream fails before emitting', async () => {
    const opened: string[] = [];
    const received: string[] = [];
    const stream = streamWithChain<AsyncGenerator<string>, string>({
      candidates: [SONNET, GPT],
      logger,
      open: (model) => {
        opened.push(model);
        return model === SONNET ? failImmediately() : chunksOf('fallback');
      },
      chunks: (h) => h,
    });
    for await (const chunk of stream) {
      received.push(chunk);
    }
    expect(opened).toEqual([SONNET, GPT]);
    expect(received).toEqual(['fallback']);
  });

  it('does not switch models after the first emitted chunk', async () => {
    const opened: string[] = [];
    const received: string[] = [];
    const stream = streamWithChain<AsyncGenerator<string>, string>({
      candidates: [SONNET, GPT],
      logger,
      open: (model) => {
        opened.push(model);
        return failAfter('partial');
      },
      chunks: (h) => h,
    });
    await expect(async () => {
      for await (const chunk of stream) {
        received.push(chunk);
      }
    }).rejects.toThrow('mid-stream failure');
    expect(opened).toEqual([SONNET]);
    expect(received).toEqual(['partial']);
  });

  it('rethrows without falling back when the request was aborted', async () => {
    const opened: string[] = [];
    const stream = streamWithChain<AsyncGenerator<string>, string>({
      candidates: [SONNET, GPT],
      logger,
      open: (model) => {
        opened.push(model);
        return failImmediately();
      },
      chunks: (h) => h,
      isAborted: () => true,
    });
    await expect(async () => {
      for await (const chunk of stream) {
        void chunk;
      }
    }).rejects.toThrow('fresh failure');
    expect(opened).toEqual([SONNET]);
  });

  it('runs onSettle on the last active handle', async () => {
    const settled: string[] = [];
    const handles = new Map<string, AsyncGenerator<string>>();
    const stream = streamWithChain<string, string>({
      candidates: [SONNET, GPT],
      logger,
      open: (model) => {
        handles.set(
          model,
          model === SONNET ? failImmediately() : chunksOf('x')
        );
        return model;
      },
      chunks: (model) => handles.get(model) as AsyncGenerator<string>,
      onSettle: (active) => settled.push(active),
    });
    for await (const chunk of stream) {
      void chunk;
    }
    expect(settled).toEqual([GPT]);
  });

  it('falls to the next candidate when open throws synchronously', async () => {
    const cooldown = {
      isCooling: vi.fn(),
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
    };
    const settled: string[] = [];
    const received: string[] = [];
    const stream = streamWithChain<AsyncGenerator<string>, string>({
      candidates: [SONNET, GPT],
      logger,
      cooldown,
      open: (model) => {
        if (model === SONNET) {
          throw new Error('provider not configured');
        }
        return chunksOf('fallback');
      },
      chunks: (h) => h,
      onSettle: () => settled.push('settled'),
    });
    for await (const chunk of stream) {
      received.push(chunk);
    }
    expect(received).toEqual(['fallback']);
    expect(cooldown.recordFailure).toHaveBeenCalledWith('anthropic');
    expect(cooldown.recordSuccess).toHaveBeenCalledWith('openai');
    expect(settled).toEqual(['settled']);
  });

  it('rethrows when open throws synchronously on the last candidate', async () => {
    const settled: string[] = [];
    const stream = streamWithChain<string, string>({
      candidates: [SONNET, GPT],
      logger,
      open: () => {
        throw new Error('provider not configured');
      },
      chunks: () => chunksOf(),
      onSettle: (active) => settled.push(active),
    });
    await expect(async () => {
      for await (const chunk of stream) {
        void chunk;
      }
    }).rejects.toThrow('provider not configured');
    expect(settled).toEqual([]);
  });

  it('passes isLast so callers can decide throw-vs-degrade on the final model', async () => {
    const infos: boolean[] = [];
    const stream = streamWithChain<AsyncGenerator<string>, string>({
      candidates: [SONNET, GPT, GEMINI],
      logger,
      open: (model, info) => {
        infos.push(info.isLast);
        return model === GEMINI ? chunksOf('z') : failImmediately();
      },
      chunks: (h) => h,
    });
    for await (const chunk of stream) {
      void chunk;
    }
    expect(infos).toEqual([false, false, true]);
  });

  it('advances past a candidate that fails after only ephemeral chunks', async () => {
    const received: string[] = [];
    const gen = streamWithChain<string, string>({
      candidates: ['a', 'b'],
      logger: { warn: vi.fn(), error: vi.fn() },
      open: (model) => model,
      chunks: (model) =>
        model === 'a'
          ? (async function* () {
              yield 'think:hmm';
              throw new Error('boom');
            })()
          : (async function* () {
              yield 'answer';
            })(),
      isEphemeralChunk: (chunk) => chunk.startsWith('think:'),
    });
    for await (const chunk of gen) {
      received.push(chunk);
    }
    expect(received).toEqual(['think:hmm', 'answer']);
  });

  it('still finalizes the model once a non-ephemeral chunk was emitted', async () => {
    const gen = streamWithChain<string, string>({
      candidates: ['a', 'b'],
      logger: { warn: vi.fn(), error: vi.fn() },
      open: (model) => model,
      chunks: () =>
        (async function* () {
          yield 'answer-part';
          throw new Error('boom');
        })(),
      isEphemeralChunk: (chunk) => chunk.startsWith('think:'),
    });
    const received: string[] = [];
    await expect(async () => {
      for await (const chunk of gen) {
        received.push(chunk);
      }
    }).rejects.toThrow('boom');
    expect(received).toEqual(['answer-part']);
  });
});

describe('streamWithChain cooldown outcome', () => {
  interface Event {
    type: string;
  }

  function makeCooldown() {
    return {
      isCooling: vi.fn().mockReturnValue(false),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    };
  }

  async function* eventsOf(...types: string[]): AsyncGenerator<Event> {
    for (const type of types) {
      yield { type };
    }
  }

  it('records failure when the stream completes after a failure chunk', async () => {
    const cooldown = makeCooldown();
    const stream = streamWithChain<AsyncGenerator<Event>, Event>({
      candidates: [SONNET],
      cooldown,
      logger,
      open: () => eventsOf('chunk', 'error'),
      chunks: (h) => h,
      isFailureChunk: (c) => c.type === 'error',
    });
    for await (const chunk of stream) {
      void chunk;
    }
    expect(cooldown.recordFailure).toHaveBeenCalledWith('anthropic');
    expect(cooldown.recordSuccess).not.toHaveBeenCalled();
  });

  it('still records success when no failure chunk was yielded', async () => {
    const cooldown = makeCooldown();
    const stream = streamWithChain<AsyncGenerator<Event>, Event>({
      candidates: [SONNET],
      cooldown,
      logger,
      open: () => eventsOf('chunk', 'done'),
      chunks: (h) => h,
      isFailureChunk: (c) => c.type === 'error',
    });
    for await (const chunk of stream) {
      void chunk;
    }
    expect(cooldown.recordSuccess).toHaveBeenCalledWith('anthropic');
    expect(cooldown.recordFailure).not.toHaveBeenCalled();
  });

  it('does not treat aborted events as failures', async () => {
    const cooldown = makeCooldown();
    const stream = streamWithChain<AsyncGenerator<Event>, Event>({
      candidates: [SONNET],
      cooldown,
      logger,
      open: () => eventsOf('chunk', 'aborted'),
      chunks: (h) => h,
      isFailureChunk: (c) => c.type === 'error',
    });
    for await (const chunk of stream) {
      void chunk;
    }
    expect(cooldown.recordSuccess).toHaveBeenCalledWith('anthropic');
    expect(cooldown.recordFailure).not.toHaveBeenCalled();
  });

  it('attributes terminal success to the model that served the stream, not the opened candidate', async () => {
    const cooldown = makeCooldown();
    const served = { model: SONNET };
    async function* switched(): AsyncGenerator<Event> {
      yield { type: 'chunk' };
      served.model = GPT;
      yield { type: 'done' };
    }
    const stream = streamWithChain<AsyncGenerator<Event>, Event>({
      candidates: [SONNET],
      cooldown,
      logger,
      settledModel: () => served.model,
      open: () => switched(),
      chunks: (h) => h,
      isFailureChunk: (c) => c.type === 'error',
    });
    for await (const chunk of stream) {
      void chunk;
    }
    expect(cooldown.recordSuccess).toHaveBeenCalledWith('openai');
    expect(cooldown.recordSuccess).not.toHaveBeenCalledWith('anthropic');
  });

  it('falls back to the opened candidate when settledModel is absent', async () => {
    const cooldown = makeCooldown();
    const stream = streamWithChain<AsyncGenerator<Event>, Event>({
      candidates: [SONNET],
      cooldown,
      logger,
      settledModel: () => undefined,
      open: () => eventsOf('chunk', 'done'),
      chunks: (h) => h,
      isFailureChunk: (c) => c.type === 'error',
    });
    for await (const chunk of stream) {
      void chunk;
    }
    expect(cooldown.recordSuccess).toHaveBeenCalledWith('anthropic');
  });
});
