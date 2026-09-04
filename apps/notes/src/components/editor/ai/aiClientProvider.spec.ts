import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIStreamHandle } from '@knowtis/api-client';
import { aiClient } from '@knowtis/api-client';

import { createAiClientProvider } from './aiClientProvider';

const { captureProductEvent } = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
}));

vi.mock('@knowtis/api-client', () => ({
  aiClient: { stream: vi.fn() },
}));
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));

interface StreamCallbacks {
  onChunk: (payload: { text: string }) => void;
  onDone: (payload: { usage: unknown }) => void;
  onError: (payload: { message: string }) => void;
}

function captureStream() {
  const cancel = vi.fn();
  let callbacks: StreamCallbacks | null = null;
  vi.mocked(aiClient.stream).mockImplementation((_payload, nextCallbacks) => {
    callbacks = nextCallbacks as StreamCallbacks;
    return { cancel } as AIStreamHandle;
  });
  return {
    cancel,
    getCallbacks: () => {
      if (!callbacks) {
        throw new Error('stream callbacks not captured');
      }
      return callbacks;
    },
  };
}

function stream(signal: AbortSignal) {
  return createAiClientProvider('ghost-text').stream({
    content: 'private content',
    suffix: 'private suffix',
    signal,
  });
}

describe('createAiClientProvider completion analytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('captures only a normally consumed upstream completion', async () => {
    const upstream = captureStream();
    const iterator = stream(new AbortController().signal)[
      Symbol.asyncIterator
    ]();
    const completion = iterator.next();

    upstream.getCallbacks().onDone({
      usage: { model: 'private', inputTokens: 1, outputTokens: 2, costUsd: 3 },
    });

    await expect(completion).resolves.toEqual({ done: true, value: undefined });
    expect(captureProductEvent).toHaveBeenCalledWith('ai response completed', {
      source: 'editor',
      assistant_type: 'ghost_text',
      action: 'ghost-text',
    });
    expect(captureProductEvent).toHaveBeenCalledTimes(1);
  });

  it('does not capture an error', async () => {
    const upstream = captureStream();
    const iterator = stream(new AbortController().signal)[
      Symbol.asyncIterator
    ]();
    const completion = iterator.next();

    upstream.getCallbacks().onError({ message: 'failed' });

    await expect(completion).rejects.toThrow('failed');
    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not treat abort-generated synthetic completion as upstream success', async () => {
    const upstream = captureStream();
    const abort = new AbortController();
    const iterator = stream(abort.signal)[Symbol.asyncIterator]();
    const completion = iterator.next();

    abort.abort();

    await expect(completion).resolves.toEqual({ done: true, value: undefined });
    expect(upstream.cancel).toHaveBeenCalled();
    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not capture for a request aborted before streaming', async () => {
    const abort = new AbortController();
    abort.abort();

    const chunks = [];
    for await (const chunk of stream(abort.signal)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([]);
    expect(aiClient.stream).not.toHaveBeenCalled();
    expect(captureProductEvent).not.toHaveBeenCalled();
  });
});
