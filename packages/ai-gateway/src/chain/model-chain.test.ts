import { describe, expect, it, vi } from 'vitest';

import {
  executeWithChain,
  resolveChainCandidates,
  streamWithChain,
} from './model-chain';
import { ProviderCooldownTracker } from './provider-cooldown.tracker';

const logger = { warn: vi.fn(), error: vi.fn() };

const SONNET = 'anthropic:claude-sonnet-4-20250514';
const HAIKU = 'anthropic:claude-haiku-4-5-20251001';
const GPT = 'openai:gpt-4o-mini';
const GEMINI = 'google:gemini-2.0-flash';

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

describe('resolveChainCandidates', () => {
  it('puts the primary first and dedupes chain entries', () => {
    expect(
      resolveChainCandidates({
        primaryModel: SONNET,
        chain: [HAIKU, SONNET, GPT, HAIKU],
      })
    ).toEqual([SONNET, HAIKU, GPT]);
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
});
