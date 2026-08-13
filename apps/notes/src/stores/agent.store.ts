import { queryClient } from '@/lib/query-client';
import { create } from 'zustand';

import {
  agentClient,
  type AgentErrorPayload,
  type AgentSource,
  type AgentStreamHandle,
  type WebSource,
} from '@knowtis/api-client';
import { notesQueryKeys } from '@knowtis/data-access-notes';

import { createChunkBuffer } from './chunk-buffer';

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
  webSources?: WebSource[];
  proposal?: { kind: PendingProposal['kind']; summary: string };
  committed?: { kind: PendingProposal['kind']; title: string };
  discarded?: boolean;
}

/**
 * Client-side backstop for a server that has gone silent entirely. Must stay
 * above the server's `AI_AGENT_MAX_MS` ceiling so a real failure surfaces as a
 * server error instead of a client cancel of a healthy turn.
 */
export const AGENT_STREAM_INACTIVITY_MS = 310_000;
export const THINKING_TAIL_CHARS = 400;
const CHUNK_FLUSH_MS = 50;

/** Local failure only: whether the proposal itself expired is the server's to say. */
const RESUME_UNAVAILABLE_ERROR: AgentErrorPayload = {
  code: 'AGENT_RESUME_UNAVAILABLE',
  message: 'The turn is no longer open to resume',
};

interface AgentState {
  messages: AgentChatMessage[];
  status: AgentStatus;
  error: AgentErrorPayload | null;
  pendingProposal: PendingProposal | null;
  /** Rolling tail of the model's live reasoning; ephemeral, never persisted into a message. */
  thinkingText: string;
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

  let activeAssistantId: string | null = null;
  // Per-send token: late callbacks from a superseded/cancelled stream are ignored.
  let streamVersion = 0;
  let lastNoteId: string | undefined;

  const buffer = createChunkBuffer({
    flushMs: CHUNK_FLUSH_MS,
    inactivityMs: AGENT_STREAM_INACTIVITY_MS,
    onFlush: (text) => {
      const id = activeAssistantId;
      if (!id) {
        return;
      }
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === id ? { ...m, content: m.content + text } : m
        ),
      }));
    },
    onInactivity: () => {
      get()._streamHandle?.cancel();
      thinkingBuffer.discard();
      set({ status: 'timeout', _streamHandle: null, thinkingText: '' });
    },
  });

  const thinkingBuffer = createChunkBuffer({
    flushMs: CHUNK_FLUSH_MS,
    onFlush: (text) =>
      set((s) => ({
        thinkingText: (s.thinkingText + text).slice(-THINKING_TAIL_CHARS),
      })),
  });

  const beginResumedTurn = (): AgentChatMessage => {
    const assistant: AgentChatMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
    };
    activeAssistantId = assistant.id;
    thinkingBuffer.discard();
    return assistant;
  };

  const failResume = () => {
    thinkingBuffer.discard();
    set({
      status: 'error',
      error: RESUME_UNAVAILABLE_ERROR,
      pendingProposal: null,
      thinkingText: '',
      _streamHandle: null,
    });
  };

  const run = (text: string, assistantId: string, noteId?: string) => {
    activeAssistantId = assistantId;
    const version = streamVersion;
    const handle = agentClient.sendMessage(
      text,
      {
        onChunk: ({ text }) => {
          if (version !== streamVersion) {
            return;
          }
          buffer.push(text);
        },
        onThinking: ({ text }) => {
          // Reasoning may arrive after the turn is suspended (pendingProposal) or
          // already terminal; re-arming there would resurrect the watchdog and
          // time out a proposal the user is still deliberating on.
          if (version !== streamVersion || get().status !== 'streaming') {
            return;
          }
          buffer.armInactivityTimer();
          thinkingBuffer.push(text);
        },
        onDone: ({ sources, webSources }) => {
          if (version !== streamVersion) {
            return;
          }
          buffer.clearInactivityTimer();
          buffer.flush();
          thinkingBuffer.discard();
          const id = activeAssistantId;
          set((s) => ({
            status: 'done',
            _streamHandle: null,
            thinkingText: '',
            messages: s.messages.map((m) =>
              m.id === id ? { ...m, sources, webSources } : m
            ),
          }));
        },
        onError: (error) => {
          if (version !== streamVersion) {
            return;
          }
          buffer.clearInactivityTimer();
          buffer.flush();
          thinkingBuffer.discard();
          set({
            status: 'error',
            error,
            _streamHandle: null,
            thinkingText: '',
          });
        },
        onProposal: (proposal) => {
          if (version !== streamVersion) {
            return;
          }
          buffer.clearInactivityTimer();
          buffer.flush();
          thinkingBuffer.discard();
          const id = activeAssistantId;
          set((s) => ({
            status: 'pendingProposal',
            pendingProposal: proposal,
            thinkingText: '',
            messages: s.messages.map((m) =>
              m.id === id
                ? {
                    ...m,
                    proposal: {
                      kind: proposal.kind,
                      summary: proposal.summary,
                    },
                  }
                : m
            ),
          }));
        },
        onCommitted: ({ result }) => {
          // Invalidate before the stale-stream guard: the mutation is committed
          // server-side, so the list must refresh even if a newer turn
          // superseded this stream (only the chat update below is version-gated).
          void queryClient.invalidateQueries({
            queryKey: notesQueryKeys.lists(),
          });
          void queryClient.invalidateQueries({
            queryKey: notesQueryKeys.detail(result.noteId),
          });
          if (version !== streamVersion) {
            return;
          }
          buffer.flush();
          const id = activeAssistantId;
          set((s) => ({
            pendingProposal: null,
            messages: s.messages.map((m) =>
              m.id === id
                ? {
                    ...m,
                    committed: { kind: result.kind, title: result.title },
                  }
                : m
            ),
          }));
        },
      },
      noteId
    );
    if (get().status !== 'streaming') {
      return;
    }
    buffer.armInactivityTimer();
    set({ _streamHandle: handle });
  };

  return {
    messages: [],
    status: 'idle',
    error: null,
    pendingProposal: null,
    thinkingText: '',
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
      buffer.clearInactivityTimer();
      buffer.discard();
      thinkingBuffer.discard();

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
        thinkingText: '',
        _streamHandle: null,
      });

      run(trimmed, assistantMessage.id, noteId);
    },

    newConversation: () => {
      get()._streamHandle?.cancel();
      agentClient.resetConversation();
      streamVersion++;
      buffer.clearInactivityTimer();
      buffer.discard();
      thinkingBuffer.discard();
      activeAssistantId = null;
      set({
        messages: [],
        status: 'idle',
        error: null,
        pendingProposal: null,
        thinkingText: '',
        _streamHandle: null,
      });
    },

    cancel: () => {
      get()._streamHandle?.cancel();
      streamVersion++;
      buffer.clearInactivityTimer();
      buffer.flush();
      thinkingBuffer.discard();
      activeAssistantId = null;
      set({
        status: 'idle',
        pendingProposal: null,
        thinkingText: '',
        _streamHandle: null,
      });
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
      if (!agentClient.canResume()) {
        failResume();
        return;
      }
      const assistant = beginResumedTurn();
      set((s) => ({
        status: 'streaming',
        pendingProposal: null,
        thinkingText: '',
        messages: [...s.messages, assistant],
      }));
      agentClient.approve(p.id);
      if (get().status !== 'streaming') {
        return;
      }
      buffer.armInactivityTimer();
    },

    rejectProposal: (reason) => {
      const p = get().pendingProposal;
      if (!p) {
        return;
      }
      if (!agentClient.canResume()) {
        failResume();
        return;
      }
      const assistant = beginResumedTurn();
      set((s) => {
        let marked = false;
        const messages = [...s.messages];
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m.proposal && !m.committed && !m.discarded) {
            messages[i] = { ...m, discarded: true };
            marked = true;
            break;
          }
        }
        return {
          status: 'streaming',
          pendingProposal: null,
          thinkingText: '',
          messages: marked
            ? [...messages, assistant]
            : [...s.messages, assistant],
        };
      });
      agentClient.reject(p.id, reason);
      if (get().status !== 'streaming') {
        return;
      }
      buffer.armInactivityTimer();
    },
  };
});
