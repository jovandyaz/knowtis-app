import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { streamWithModelFallback, withModelFallback } from './model-fallback';

const PRIMARY = 'anthropic:claude-sonnet-4-20250514';
const FALLBACK = 'anthropic:claude-haiku-4-5-20251001';

function makeLogger(): Logger {
  return { warn: vi.fn() } as unknown as Logger;
}

function streamOf(...chunks: string[]): AsyncIterable<string> {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

function failingStream(error: unknown): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
  };
}

function failAfter(chunk: string, error: Error): AsyncIterable<string> {
  let sent = false;
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        if (sent) {
          return Promise.reject(error);
        }
        sent = true;
        return Promise.resolve({ value: chunk, done: false });
      },
    }),
  };
}

async function drain<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of stream) {
    out.push(item);
  }
  return out;
}

describe('withModelFallback', () => {
  it('should return the primary result without invoking the fallback', async () => {
    const attempt = vi.fn().mockResolvedValue('ok');

    const result = await withModelFallback(attempt, {
      primaryModel: PRIMARY,
      fallbackModel: FALLBACK,
      logger: makeLogger(),
    });

    expect(result).toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith(PRIMARY);
  });

  it('should retry once with the fallback model and log a structured warning when the primary fails', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error('primary down'))
      .mockResolvedValueOnce('recovered');
    const logger = makeLogger();

    const result = await withModelFallback(attempt, {
      primaryModel: PRIMARY,
      fallbackModel: FALLBACK,
      logger,
    });

    expect(result).toBe('recovered');
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(attempt).toHaveBeenLastCalledWith(FALLBACK);
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'ai.provider.fallback',
      primaryModel: PRIMARY,
      fallbackModel: FALLBACK,
      provider: 'anthropic',
      reason: 'primary down',
    });
  });

  it('should rethrow an AbortError without falling back', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await expect(
      withModelFallback(attempt, {
        primaryModel: PRIMARY,
        fallbackModel: FALLBACK,
        logger: makeLogger(),
      })
    ).rejects.toThrow('aborted');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('should rethrow when no fallback model is configured', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('down'));

    await expect(
      withModelFallback(attempt, {
        primaryModel: PRIMARY,
        fallbackModel: undefined,
        logger: makeLogger(),
      })
    ).rejects.toThrow('down');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('should rethrow when the fallback model equals the primary', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('down'));

    await expect(
      withModelFallback(attempt, {
        primaryModel: PRIMARY,
        fallbackModel: PRIMARY,
        logger: makeLogger(),
      })
    ).rejects.toThrow('down');
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe('streamWithModelFallback', () => {
  it('should stream primary chunks without opening a fallback', async () => {
    const open = vi.fn();

    const chunks = await drain(
      streamWithModelFallback({
        primaryModel: PRIMARY,
        fallbackModel: FALLBACK,
        logger: makeLogger(),
        primary: streamOf('a', 'b'),
        open,
        chunks: (handle) => handle,
      })
    );

    expect(chunks).toEqual(['a', 'b']);
    expect(open).not.toHaveBeenCalled();
  });

  it('should open the fallback stream when the primary fails before emitting', async () => {
    const open = vi.fn().mockReturnValue(streamOf('recovered'));
    const logger = makeLogger();

    const chunks = await drain(
      streamWithModelFallback({
        primaryModel: PRIMARY,
        fallbackModel: FALLBACK,
        logger,
        primary: failingStream(new Error('primary down')),
        open,
        chunks: (handle) => handle,
      })
    );

    expect(chunks).toEqual(['recovered']);
    expect(open).toHaveBeenCalledWith(FALLBACK);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai.provider.stream_fallback' })
    );
  });

  it('should rethrow once a chunk has been emitted', async () => {
    const open = vi.fn();

    await expect(
      drain(
        streamWithModelFallback({
          primaryModel: PRIMARY,
          fallbackModel: FALLBACK,
          logger: makeLogger(),
          primary: failAfter('partial', new Error('mid-stream')),
          open,
          chunks: (handle) => handle,
        })
      )
    ).rejects.toThrow('mid-stream');
    expect(open).not.toHaveBeenCalled();
  });

  it('should rethrow when the consumer aborted', async () => {
    const open = vi.fn();

    await expect(
      drain(
        streamWithModelFallback({
          primaryModel: PRIMARY,
          fallbackModel: FALLBACK,
          logger: makeLogger(),
          primary: failingStream(new Error('cancelled')),
          open,
          chunks: (handle) => handle,
          isAborted: () => true,
        })
      )
    ).rejects.toThrow('cancelled');
    expect(open).not.toHaveBeenCalled();
  });

  it('should rethrow an AbortError without falling back', async () => {
    const open = vi.fn();

    await expect(
      drain(
        streamWithModelFallback({
          primaryModel: PRIMARY,
          fallbackModel: FALLBACK,
          logger: makeLogger(),
          primary: failingStream(new DOMException('aborted', 'AbortError')),
          open,
          chunks: (handle) => handle,
        })
      )
    ).rejects.toThrow('aborted');
    expect(open).not.toHaveBeenCalled();
  });

  it('should settle on the active handle after a fallback', async () => {
    const fallbackHandle = streamOf('recovered');
    const onSettle = vi.fn();

    await drain(
      streamWithModelFallback({
        primaryModel: PRIMARY,
        fallbackModel: FALLBACK,
        logger: makeLogger(),
        primary: failingStream(new Error('primary down')),
        open: () => fallbackHandle,
        chunks: (handle) => handle,
        onSettle,
      })
    );

    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith(fallbackHandle);
  });
});
