import { create } from 'zustand';

import {
  agentClient,
  type AgentErrorPayload,
  type AgentSource,
  type AgentStreamHandle,
  type AgentWireMessage,
} from '@knowtis/api-client';

export type AgentStatus =
  | 'idle'
  | 'streaming'
  | 'pendingProposal'
  | 'done'
  | 'error'
  | 'timeout';

export interface PendingProposal {
  id: string;
  kind: 'create' | 'update' | 'share';
  targetNoteId: string | null;
  summary: string;
  previewHtml: string | null;
  payload: Record<string, unknown>;
}

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
  pendingProposal: PendingProposal | null;
  _streamHandle: AgentStreamHandle | null;
  sendMessage: (text: string, noteId?: string) => void;
  newConversation: () => void;
  cancel: () => void;
  retryLast: () => void;
  approveProposal: () => void;
  rejectProposal: (reason?: string) => void;
}

export const useAgentStore = create<AgentState>((set, get) => {
  let seq = 0;
  const nextId = () => `m${++seq}`;

  let chunkBuffer = '';
  let activeAssistantId: string | null = null;
  // Per-send token: late callbacks from a superseded/cancelled stream are ignored.
  let streamVersion = 0;
  let lastNoteId: string | undefined;
  let knownNotes: AgentSource[] = [];
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

  const run = (
    history: AgentWireMessage[],
    assistantId: string,
    noteId?: string
  ) => {
    activeAssistantId = assistantId;
    const version = streamVersion;
    const handle = agentClient.sendMessage(
      history,
      {
        onChunk: ({ text }) => {
          if (version !== streamVersion) {
            return;
          }
          armInactivityTimer();
          chunkBuffer += text;
          scheduleFlush();
        },
        onDone: ({ sources, knownNotes: turnKnownNotes }) => {
          if (version !== streamVersion) {
            return;
          }
          knownNotes = turnKnownNotes;
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
          if (version !== streamVersion) {
            return;
          }
          clearInactivityTimer();
          flushChunks();
          set({ status: 'error', error, _streamHandle: null });
        },
        onProposal: (proposal) => {
          if (version !== streamVersion) {
            return;
          }
          clearInactivityTimer();
          flushChunks();
          set({ status: 'pendingProposal', pendingProposal: proposal });
        },
        onCommitted: ({ result }) => {
          if (version !== streamVersion) {
            return;
          }
          const id = activeAssistantId;
          set((s) => ({
            pendingProposal: null,
            messages: s.messages.map((m) =>
              m.id === id ? { ...m, content: `✓ ${result.title}\n\n` } : m
            ),
          }));
        },
      },
      noteId,
      knownNotes
    );
    armInactivityTimer();
    set({ _streamHandle: handle });
  };

  return {
    messages: [],
    status: 'idle',
    error: null,
    pendingProposal: null,
    _streamHandle: null,

    sendMessage: (text, noteId) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const current = get();
      if (current.status === 'streaming' && current._streamHandle) {
        current._streamHandle.cancel();
      }
      streamVersion++;
      lastNoteId = noteId;
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

      run(history, assistantMessage.id, noteId);
    },

    newConversation: () => {
      get()._streamHandle?.cancel();
      streamVersion++;
      clearInactivityTimer();
      discardChunks();
      activeAssistantId = null;
      knownNotes = [];
      set({
        messages: [],
        status: 'idle',
        error: null,
        pendingProposal: null,
        _streamHandle: null,
      });
    },

    cancel: () => {
      get()._streamHandle?.cancel();
      streamVersion++;
      clearInactivityTimer();
      flushChunks();
      activeAssistantId = null;
      set({ status: 'idle', pendingProposal: null, _streamHandle: null });
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
      get().sendMessage(text, lastNoteId);
    },

    approveProposal: () => {
      const p = get().pendingProposal;
      if (!p) {
        return;
      }
      const assistant: AgentChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
      };
      activeAssistantId = assistant.id;
      set((s) => ({
        status: 'streaming',
        pendingProposal: null,
        messages: [...s.messages, assistant],
      }));
      armInactivityTimer();
      agentClient.approve(p.id);
    },

    rejectProposal: (reason) => {
      const p = get().pendingProposal;
      if (!p) {
        return;
      }
      const assistant: AgentChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
      };
      activeAssistantId = assistant.id;
      set((s) => ({
        status: 'streaming',
        pendingProposal: null,
        messages: [...s.messages, assistant],
      }));
      armInactivityTimer();
      agentClient.reject(p.id, reason);
    },
  };
});
