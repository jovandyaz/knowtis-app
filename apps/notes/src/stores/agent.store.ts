import { create } from 'zustand';

import {
  agentClient,
  type AgentErrorPayload,
  type AgentSource,
  type AgentStreamHandle,
  type AgentWireMessage,
} from '@knowtis/api-client';

type AgentStatus = 'idle' | 'streaming' | 'done' | 'error' | 'timeout';

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AgentSource[];
}

export const AGENT_STREAM_INACTIVITY_MS = 45000;
const CHUNK_FLUSH_MS = 50;

interface AgentState {
  messages: AgentChatMessage[];
  status: AgentStatus;
  error: AgentErrorPayload | null;
  _streamHandle: AgentStreamHandle | null;
  sendMessage: (text: string) => void;
  newConversation: () => void;
  cancel: () => void;
  retryLast: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => {
  let seq = 0;
  const nextId = () => `m${++seq}`;

  let chunkBuffer = '';
  let activeAssistantId: string | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  // Closure (not store state): arming/clearing per chunk must not re-render.
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFlushTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flushChunks = () => {
    clearFlushTimer();
    if (chunkBuffer && activeAssistantId) {
      const buffered = chunkBuffer;
      const id = activeAssistantId;
      chunkBuffer = '';
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === id ? { ...m, content: m.content + buffered } : m
        ),
      }));
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

  const armInactivityTimer = () => {
    clearInactivityTimer();
    inactivityTimer = setTimeout(() => {
      inactivityTimer = null;
      flushChunks();
      get()._streamHandle?.cancel();
      set({ status: 'timeout', _streamHandle: null });
    }, AGENT_STREAM_INACTIVITY_MS);
  };

  const run = (history: AgentWireMessage[], assistantId: string) => {
    activeAssistantId = assistantId;
    const handle = agentClient.sendMessage(history, {
      onChunk: ({ text }) => {
        armInactivityTimer();
        chunkBuffer += text;
        scheduleFlush();
      },
      onDone: ({ sources }) => {
        clearInactivityTimer();
        flushChunks();
        set((s) => ({
          status: 'done',
          _streamHandle: null,
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, sources } : m
          ),
        }));
      },
      onError: (error) => {
        clearInactivityTimer();
        flushChunks();
        set({ status: 'error', error, _streamHandle: null });
      },
    });
    armInactivityTimer();
    set({ _streamHandle: handle });
  };

  return {
    messages: [],
    status: 'idle',
    error: null,
    _streamHandle: null,

    sendMessage: (text) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const current = get();
      if (current.status === 'streaming' && current._streamHandle) {
        current._streamHandle.cancel();
      }
      clearInactivityTimer();
      discardChunks();

      const history: AgentWireMessage[] = [
        ...current.messages
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: trimmed },
      ];

      const userMessage: AgentChatMessage = {
        id: nextId(),
        role: 'user',
        content: trimmed,
      };
      const assistantMessage: AgentChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
      };

      set({
        messages: [...current.messages, userMessage, assistantMessage],
        status: 'streaming',
        error: null,
        _streamHandle: null,
      });

      run(history, assistantMessage.id);
    },

    newConversation: () => {
      get()._streamHandle?.cancel();
      clearInactivityTimer();
      discardChunks();
      activeAssistantId = null;
      set({ messages: [], status: 'idle', error: null, _streamHandle: null });
    },

    cancel: () => {
      get()._streamHandle?.cancel();
      clearInactivityTimer();
      flushChunks();
      activeAssistantId = null;
      set({ status: 'idle', _streamHandle: null });
    },

    retryLast: () => {
      const { messages } = get();
      let lastUserIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx === -1) {
        return;
      }
      const text = messages[lastUserIdx].content;
      set({ messages: messages.slice(0, lastUserIdx) });
      get().sendMessage(text);
    },
  };
});
