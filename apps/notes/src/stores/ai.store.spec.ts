import { aiErrorMessageKey } from '@/components/editor/ai/ai-error-messages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AICompletePayload,
  AIErrorPayload,
  AIStreamHandle,
} from '@knowtis/api-client';
import { aiClient } from '@knowtis/api-client';

import { STREAM_INACTIVITY_MS, useAIStore } from './ai.store';

vi.mock('@knowtis/api-client', () => ({
  aiClient: { stream: vi.fn() },
}));

interface StreamCallbacks {
  onChunk: (payload: { text: string }) => void;
  onDone: (payload: { usage: unknown }) => void;
  onError: (payload: AIErrorPayload) => void;
}

const PAYLOAD: AICompletePayload = { action: 'summarize', content: 'hello' };

function captureCallbacks(): {
  cancel: ReturnType<typeof vi.fn>;
  getCallbacks: () => StreamCallbacks;
} {
  const cancel = vi.fn();
  let captured: StreamCallbacks | null = null;
  vi.mocked(aiClient.stream).mockImplementation((_payload, callbacks) => {
    captured = callbacks as StreamCallbacks;
    return { cancel } as AIStreamHandle;
  });
  return {
    cancel,
    getCallbacks: () => {
      if (!captured) {
        throw new Error('stream callbacks not captured');
      }
      return captured;
    },
  };
}

describe('useAIStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useAIStore.getState().reset();
  });

  afterEach(() => {
    useAIStore.getState().reset();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('inactivity timeout', () => {
    it('transitions to timeout after STREAM_INACTIVITY_MS with no chunks and cancels the stream', () => {
      const { cancel } = captureCallbacks();

      useAIStore.getState().startStream(PAYLOAD);
      expect(useAIStore.getState().status).toBe('streaming');

      vi.advanceTimersByTime(STREAM_INACTIVITY_MS);

      expect(useAIStore.getState().status).toBe('timeout');
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(useAIStore.getState()._streamHandle).toBeNull();
    });

    it('resets the inactivity timer on each chunk so long generations are not cut', () => {
      const { cancel, getCallbacks } = captureCallbacks();

      useAIStore.getState().startStream(PAYLOAD);

      const interval = 30_000;
      const total = 120_000;
      for (let elapsed = interval; elapsed <= total; elapsed += interval) {
        vi.advanceTimersByTime(interval);
        getCallbacks().onChunk({ text: 'x' });
      }

      expect(useAIStore.getState().status).toBe('streaming');
      expect(cancel).not.toHaveBeenCalled();
    });
  });

  describe('batched chunk commits', () => {
    it('flushes buffered chunks together after the flush window', () => {
      const { getCallbacks } = captureCallbacks();

      useAIStore.getState().startStream(PAYLOAD);

      getCallbacks().onChunk({ text: 'a' });
      getCallbacks().onChunk({ text: 'b' });
      getCallbacks().onChunk({ text: 'c' });

      expect(useAIStore.getState().streamedText).toBe('');

      vi.advanceTimersByTime(50);

      expect(useAIStore.getState().streamedText).toBe('abc');
    });

    it('flushes pending buffer on done so no text is lost', () => {
      const { getCallbacks } = captureCallbacks();

      useAIStore.getState().startStream(PAYLOAD);

      getCallbacks().onChunk({ text: 'partial' });
      getCallbacks().onDone({ usage: {} });

      expect(useAIStore.getState().status).toBe('done');
      expect(useAIStore.getState().streamedText).toBe('partial');
    });
  });
});

describe('aiErrorMessageKey', () => {
  it('maps known server and client codes to specific keys', () => {
    expect(aiErrorMessageKey('AI_RATE_LIMIT_EXCEEDED')).toBe(
      'ai.errors.rateLimited'
    );
    expect(aiErrorMessageKey('AI_PROVIDER_ERROR')).toBe('ai.errors.provider');
    expect(aiErrorMessageKey('AI_INTERNAL_ERROR')).toBe('ai.errors.provider');
    expect(aiErrorMessageKey('CONNECTION_FAILED')).toBe('ai.errors.connection');
    expect(aiErrorMessageKey('AI_FEATURE_DISABLED')).toBe(
      'ai.errors.featureDisabled'
    );
    expect(aiErrorMessageKey('AUTH_REQUIRED')).toBe('ai.errors.auth');
    expect(aiErrorMessageKey('VALIDATION_ERROR')).toBe('ai.errors.validation');
    expect(aiErrorMessageKey('PROMPT_INJECTION_DETECTED')).toBe(
      'ai.errors.injection'
    );
  });

  it('falls back to the generic key for unknown codes', () => {
    expect(aiErrorMessageKey('SOMETHING_ELSE')).toBe('ai.errors.generic');
    expect(aiErrorMessageKey('')).toBe('ai.errors.generic');
  });
});
