import { create } from 'zustand';

import {
  aiClient,
  type AICompletePayload,
  type AIErrorPayload,
  type AIStreamHandle,
} from '@knowtis/api-client';

type AIStatus = 'idle' | 'streaming' | 'done' | 'error' | 'timeout';

interface SelectionRange {
  from: number;
  to: number;
}

export const STREAM_INACTIVITY_MS = 45000;
const CHUNK_FLUSH_MS = 50;

interface AIState {
  status: AIStatus;
  streamedText: string;
  error: AIErrorPayload | null;
  lastPayload: AICompletePayload | null;
  selectionRange: SelectionRange | null;
  aiEnabled: boolean;
  _streamHandle: AIStreamHandle | null;
  startStream: (payload: AICompletePayload) => void;
  setSelectionRange: (range: SelectionRange | null) => void;
  setAIEnabled: (enabled: boolean) => void;
  retry: () => void;
  cancelStream: () => void;
  reset: () => void;
}

export const useAIStore = create<AIState>((set, get) => {
  let chunkBuffer = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  // Kept in closure (not store state) so arming/clearing it per chunk doesn't
  // trigger a store update — that would re-render subscribers and defeat the
  // chunk batching below.
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFlushTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flushChunks = () => {
    clearFlushTimer();
    if (chunkBuffer) {
      const buffered = chunkBuffer;
      chunkBuffer = '';
      set((s) => ({ streamedText: s.streamedText + buffered }));
    }
  };

  const discardChunks = () => {
    clearFlushTimer();
    chunkBuffer = '';
  };

  const scheduleFlush = () => {
    if (!flushTimer) {
      flushTimer = setTimeout(flushChunks, CHUNK_FLUSH_MS);
    }
  };

  const clearInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  };

  // Inactivity timeout — resets per chunk so long generations aren't cut.
  const armInactivityTimer = () => {
    clearInactivityTimer();
    inactivityTimer = setTimeout(() => {
      inactivityTimer = null;
      flushChunks();
      get()._streamHandle?.cancel();
      set({ status: 'timeout', _streamHandle: null });
    }, STREAM_INACTIVITY_MS);
  };

  return {
    status: 'idle',
    streamedText: '',
    error: null,
    lastPayload: null,
    selectionRange: null,
    aiEnabled: false,
    _streamHandle: null,

    startStream: (payload) => {
      const current = get();
      if (current.status === 'streaming' && current._streamHandle) {
        current._streamHandle.cancel();
      }

      clearInactivityTimer();
      discardChunks();

      set({
        status: 'streaming',
        streamedText: '',
        error: null,
        lastPayload: payload,
        _streamHandle: null,
      });

      const handle = aiClient.stream(payload, {
        onChunk: ({ text }) => {
          armInactivityTimer();
          chunkBuffer += text;
          scheduleFlush();
        },
        onDone: () => {
          clearInactivityTimer();
          flushChunks();
          set({ status: 'done', _streamHandle: null });
        },
        onError: (error) => {
          clearInactivityTimer();
          flushChunks();
          set({ status: 'error', error, _streamHandle: null });
        },
      });

      armInactivityTimer();
      set({ _streamHandle: handle });
    },

    setSelectionRange: (range) => {
      set({ selectionRange: range });
    },

    setAIEnabled: (enabled) => {
      set({ aiEnabled: enabled });
    },

    retry: () => {
      const { lastPayload } = get();
      if (lastPayload) {
        get().startStream(lastPayload);
      }
    },

    cancelStream: () => {
      const { _streamHandle } = get();
      _streamHandle?.cancel();
      clearInactivityTimer();
      discardChunks();
      set({
        status: 'idle',
        streamedText: '',
        error: null,
        _streamHandle: null,
        selectionRange: null,
      });
    },

    reset: () => {
      clearInactivityTimer();
      discardChunks();
      set({
        status: 'idle',
        streamedText: '',
        error: null,
        _streamHandle: null,
        selectionRange: null,
      });
    },
  };
});
