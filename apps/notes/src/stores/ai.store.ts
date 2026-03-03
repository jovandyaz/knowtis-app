import { create } from 'zustand';

import {
  aiClient,
  type AICompletePayload,
  type AIErrorPayload,
  type AIStreamHandle,
} from '@knowtis/api-client';

type AIStatus = 'idle' | 'streaming' | 'done' | 'error';

interface SelectionRange {
  from: number;
  to: number;
}

interface AIState {
  status: AIStatus;
  streamedText: string;
  error: AIErrorPayload | null;
  lastPayload: AICompletePayload | null;
  selectionRange: SelectionRange | null;
  _streamHandle: AIStreamHandle | null;
  startStream: (payload: AICompletePayload) => void;
  setSelectionRange: (range: SelectionRange | null) => void;
  retry: () => void;
  cancelStream: () => void;
  reset: () => void;
}

export const useAIStore = create<AIState>((set, get) => ({
  status: 'idle',
  streamedText: '',
  error: null,
  lastPayload: null,
  selectionRange: null,
  _streamHandle: null,

  startStream: (payload) => {
    const current = get();
    if (current.status === 'streaming' && current._streamHandle) {
      current._streamHandle.cancel();
    }

    set({
      status: 'streaming',
      streamedText: '',
      error: null,
      lastPayload: payload,
      _streamHandle: null,
    });

    const handle = aiClient.stream(payload, {
      onChunk: ({ text }) => {
        set((state) => ({ streamedText: state.streamedText + text }));
      },
      onDone: () => {
        set({ status: 'done', _streamHandle: null });
      },
      onError: (error) => {
        set({ status: 'error', error, _streamHandle: null });
      },
    });

    set({ _streamHandle: handle });
  },

  setSelectionRange: (range) => {
    set({ selectionRange: range });
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
    set({
      status: 'idle',
      streamedText: '',
      error: null,
      _streamHandle: null,
      selectionRange: null,
    });
  },

  reset: () => {
    set({
      status: 'idle',
      streamedText: '',
      error: null,
      _streamHandle: null,
      selectionRange: null,
    });
  },
}));
