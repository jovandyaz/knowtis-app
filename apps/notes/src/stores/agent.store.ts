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
}

export const AGENT_STREAM_INACTIVITY_MS = 45000;
const CHUNK_FLUSH_MS = 50;

const PROPOSAL_EXPIRED_ERROR: AgentErrorPayload = {
  code: 'AGENT_PROPOSAL_EXPIRED',
  message: 'The proposal can no longer be resumed',
};

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
      set({ status: 'timeout', _streamHandle: null });
    },
  });

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
        onDone: ({ sources, webSources }) => {
          if (version !== streamVersion) {
            return;
          }
          buffer.clearInactivityTimer();
          buffer.flush();
          const id = activeAssistantId;
          set((s) => ({
            status: 'done',
            _streamHandle: null,
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
          set({ status: 'error', error, _streamHandle: null });
        },
        onProposal: (proposal) => {
          if (version !== streamVersion) {
            return;
          }
          buffer.clearInactivityTimer();
          buffer.flush();
          const id = activeAssistantId;
          set((s) => ({
            status: 'pendingProposal',
            pendingProposal: proposal,
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
                    content: m.content
                      ? `${m.content}\n\n✓ ${result.title}\n\n`
                      : `✓ ${result.title}\n\n`,
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

      run(trimmed, assistantMessage.id, noteId);
    },

    newConversation: () => {
      get()._streamHandle?.cancel();
      agentClient.resetConversation();
      streamVersion++;
      buffer.clearInactivityTimer();
      buffer.discard();
      activeAssistantId = null;
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
      buffer.clearInactivityTimer();
      buffer.flush();
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
      if (!agentClient.approve(p.id)) {
        set({
          status: 'error',
          error: PROPOSAL_EXPIRED_ERROR,
          pendingProposal: null,
        });
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
      buffer.armInactivityTimer();
    },

    rejectProposal: (reason) => {
      const p = get().pendingProposal;
      if (!p) {
        return;
      }
      if (!agentClient.reject(p.id, reason)) {
        set({
          status: 'error',
          error: PROPOSAL_EXPIRED_ERROR,
          pendingProposal: null,
        });
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
      buffer.armInactivityTimer();
    },
  };
});
