import { captureProductEvent } from '@/lib/analytics/product-events';
import { queryClient } from '@/lib/query-client';
import { create, type StoreApi } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  agentClient,
  conversationsApi,
  type AgentErrorPayload,
  type AgentSource,
  type AgentStreamHandle,
  type WebSource,
} from '@knowtis/api-client';
import {
  invalidateConversations,
  isConversationGone,
} from '@knowtis/data-access-agent';
import {
  invalidateNoteCollections,
  notesQueryKeys,
} from '@knowtis/data-access-notes';
import {
  deriveConversationTitle,
  type AgentStopReason,
  type ReasoningEffort,
} from '@knowtis/shared-types';
import { COPILOT_CONVERSATION_STORAGE_KEY } from '@knowtis/shared-util';

import { createChunkBuffer } from './chunk-buffer';
import { toChatMessages } from './conversation-transcript';

/** 'auto' leaves the reasoning budget to the server. */
export type CopilotEffort = 'auto' | ReasoningEffort;

export type ConversationHydration = 'idle' | 'loading' | 'failed';

export type ConversationOpenSource = 'switcher' | 'reload';

export type ConversationOpenOutcome =
  | 'opened'
  | 'gone'
  | 'failed'
  | 'superseded'
  | 'unchanged';

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
  payload: Record<string, unknown>;
}

export interface UpdateProposal extends PendingProposal {
  kind: 'update';
  targetNoteId: string;
}

export function isUpdateProposal(p: PendingProposal): p is UpdateProposal {
  return p.kind === 'update' && p.targetNoteId !== null;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  stopReason?: AgentStopReason;
  sources?: AgentSource[];
  webSources?: WebSource[];
  proposal?: { kind: PendingProposal['kind'] };
  committed?: { kind: PendingProposal['kind']; title: string };
  discarded?: boolean;
}

export interface QueuedMessage {
  id: string;
  text: string;
  noteId?: string;
}

export interface SendMessageOptions {
  /** Cancel the live turn and send now instead of queueing behind it. */
  interrupt?: boolean;
}

const TURN_ALIVE_STATUSES = [
  'streaming',
  'pendingProposal',
] as const satisfies readonly AgentStatus[];

/** A turn is alive while the server may still stream for it: a send must queue, not replace. */
export function isTurnAlive(status: AgentStatus): boolean {
  return (TURN_ALIVE_STATUSES as readonly AgentStatus[]).includes(status);
}

/**
 * Client-side backstop for a server that has gone silent entirely. Must stay
 * above the server's `AI_AGENT_MAX_MS` ceiling so a real failure surfaces as a
 * server error instead of a client cancel of a healthy turn.
 */
export const AGENT_STREAM_INACTIVITY_MS = 310_000;
/** Well above the panel's visible height so it scrolls, capped so a verbose
 * model cannot grow the store unbounded. */
export const THINKING_TAIL_CHARS = 4_000;
const CHUNK_FLUSH_MS = 50;

/** Local failure only: whether the proposal itself expired is the server's to say. */
const RESUME_UNAVAILABLE_ERROR: AgentErrorPayload = {
  code: 'AGENT_RESUME_UNAVAILABLE',
  message: 'The turn is no longer open to resume',
};

interface AgentState {
  messages: AgentChatMessage[];
  /** Messages waiting for the live turn to end; drained FIFO on `done` only. */
  queue: QueuedMessage[];
  /** Composer text; kept here so closing the dock (the mobile Dialog unmounts) does not lose it. */
  draft: string;
  status: AgentStatus;
  error: AgentErrorPayload | null;
  /** The failure the UI has already answered with an offer, if any. */
  answeredError: AgentErrorPayload | null;
  pendingProposal: PendingProposal | null;
  /** Rolling tail of the model's live reasoning; ephemeral, never persisted into a message. */
  thinkingText: string;
  /** Per-conversation reasoning effort for the registered caller; never a stored preference. */
  reasoningEffort: CopilotEffort;
  userId: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  hydration: ConversationHydration;
  hasEarlier: boolean;
  _streamHandle: AgentStreamHandle | null;
  setReasoningEffort: (effort: CopilotEffort) => void;
  bindUser: (userId: string) => void;
  setConversationTitle: (title: string) => void;
  openConversation: (
    id: string,
    source: ConversationOpenSource
  ) => Promise<ConversationOpenOutcome>;
  markErrorAnswered: () => void;
  sendMessage: (
    text: string,
    noteId?: string,
    options?: SendMessageOptions
  ) => void;
  setDraft: (text: string) => void;
  removeQueued: (id: string) => void;
  /** Sends the item now: immediately when idle, interrupting when a turn is alive. */
  sendQueuedNow: (id: string) => void;
  /** Moves the newest queued item back into `draft`; no-op when the queue is empty or the draft has text. */
  takeBackQueued: () => void;
  newConversation: () => void;
  cancel: () => void;
  retryLast: () => void;
  approveProposal: () => void;
  rejectProposal: (reason?: string) => void;
}

type SetAgentState = StoreApi<AgentState>['setState'];
type GetAgentState = StoreApi<AgentState>['getState'];

function createAgentState(set: SetAgentState, get: GetAgentState): AgentState {
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
    const storeEffort = get().reasoningEffort;
    const effort = storeEffort === 'auto' ? undefined : storeEffort;
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
        onConversation: (conversationId) => {
          if (
            version !== streamVersion ||
            conversationId === get().conversationId
          ) {
            return;
          }
          set({
            conversationId,
            conversationTitle: deriveConversationTitle(text),
          });
        },
        onDone: ({ sources, webSources, stopReason }) => {
          if (version !== streamVersion || get().status !== 'streaming') {
            return;
          }
          invalidateConversations(queryClient);
          buffer.clearInactivityTimer();
          buffer.flush();
          thinkingBuffer.discard();
          const id = activeAssistantId;
          set((s) => ({
            status: 'done',
            _streamHandle: null,
            thinkingText: '',
            messages: s.messages.map((m) =>
              m.id === id ? { ...m, sources, webSources, stopReason } : m
            ),
          }));
          captureProductEvent('ai response completed', {
            source: 'copilot',
            assistant_type: 'agent',
          });
          drainQueue();
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
              m.id === id ? { ...m, proposal: { kind: proposal.kind } } : m
            ),
          }));
        },
        onCommitted: ({ result }) => {
          // Invalidate before the stale-stream guard: the mutation is committed
          // server-side, so the caches must refresh even if a newer turn
          // superseded this stream (only the chat update below is version-gated).
          invalidateNoteCollections(queryClient);
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
      noteId,
      effort ? { effort } : undefined
    );
    if (get().status !== 'streaming') {
      return;
    }
    buffer.armInactivityTimer();
    set({ _streamHandle: handle });
  };

  const startTurn = (text: string, noteId?: string) => {
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
      content: text,
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
      pendingProposal: null,
      thinkingText: '',
      _streamHandle: null,
      hydration: 'idle',
    });

    run(text, assistantMessage.id, noteId);
  };

  const drainQueue = () => {
    const [next, ...rest] = get().queue;
    if (!next) {
      return;
    }
    set({ queue: rest });
    startTurn(next.text, next.noteId);
  };

  return {
    messages: [],
    queue: [],
    draft: '',
    status: 'idle',
    error: null,
    answeredError: null,
    pendingProposal: null,
    thinkingText: '',
    reasoningEffort: 'auto',
    userId: null,
    conversationId: null,
    conversationTitle: null,
    hydration: 'idle',
    hasEarlier: false,
    _streamHandle: null,

    setReasoningEffort: (effort) => set({ reasoningEffort: effort }),

    bindUser: (userId) => {
      const { userId: boundUserId, conversationId } = get();
      if (boundUserId === userId) {
        return;
      }
      if (conversationId !== null) {
        get().newConversation();
      }
      set({ userId });
    },

    setConversationTitle: (title) => set({ conversationTitle: title }),

    openConversation: async (id, source) => {
      const current = get();
      if (
        id === current.conversationId &&
        (current.hydration === 'loading' || current.messages.length > 0)
      ) {
        return 'unchanged';
      }
      current._streamHandle?.cancel();
      streamVersion++;
      const version = streamVersion;
      buffer.clearInactivityTimer();
      buffer.discard();
      thinkingBuffer.discard();
      activeAssistantId = null;
      agentClient.resumeConversation(id);
      const switching = id !== current.conversationId;
      set({
        conversationId: id,
        conversationTitle: switching ? null : current.conversationTitle,
        messages: [],
        queue: [],
        status: 'idle',
        error: null,
        pendingProposal: null,
        thinkingText: '',
        _streamHandle: null,
        hydration: 'loading',
        hasEarlier: false,
        ...(switching ? { reasoningEffort: 'auto' as const } : {}),
      });
      try {
        const transcript = await conversationsApi.transcript(id);
        if (version !== streamVersion) {
          const latest = get();
          if (
            latest.conversationId === id &&
            latest.conversationTitle === null
          ) {
            set({ conversationTitle: transcript.title });
          }
          return 'superseded';
        }
        set({
          messages: toChatMessages(transcript.messages, nextId),
          conversationTitle: transcript.title,
          hasEarlier: transcript.hasEarlier,
          hydration: 'idle',
        });
        captureProductEvent('ai conversation opened', { source });
        return 'opened';
      } catch (error) {
        if (version !== streamVersion) {
          return 'superseded';
        }
        if (isConversationGone(error)) {
          agentClient.resetConversation();
          set({
            conversationId: null,
            conversationTitle: null,
            hydration: 'idle',
          });
          return 'gone';
        }
        set({ hydration: 'failed' });
        return 'failed';
      }
    },

    // Keyed on the failure itself, so a later one is answered again without
    // any of the store's error transitions having to remember to clear this.
    markErrorAnswered: () => set({ answeredError: get().error }),

    sendMessage: (text, noteId, options) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      if (isTurnAlive(get().status) && !options?.interrupt) {
        const queued: QueuedMessage = {
          id: nextId(),
          text: trimmed,
          ...(noteId !== undefined ? { noteId } : {}),
        };
        set((s) => ({ queue: [...s.queue, queued] }));
        captureProductEvent('ai message queued', {
          source: 'copilot',
          queue_length: get().queue.length,
        });
        return;
      }
      startTurn(trimmed, noteId);
    },

    setDraft: (text) => set({ draft: text }),

    removeQueued: (id) =>
      set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),

    sendQueuedNow: (id) => {
      const item = get().queue.find((q) => q.id === id);
      if (!item) {
        return;
      }
      get().removeQueued(id);
      startTurn(item.text, item.noteId);
    },

    takeBackQueued: () => {
      const { queue, draft } = get();
      const last = queue.at(-1);
      if (!last || draft.trim().length > 0) {
        return;
      }
      set({ queue: queue.slice(0, -1), draft: last.text });
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
        queue: [],
        draft: '',
        status: 'idle',
        error: null,
        pendingProposal: null,
        thinkingText: '',
        reasoningEffort: 'auto',
        conversationId: null,
        conversationTitle: null,
        hydration: 'idle',
        hasEarlier: false,
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
}

export const useAgentStore = create<AgentState>()(
  persist((set, get) => createAgentState(set, get), {
    name: COPILOT_CONVERSATION_STORAGE_KEY,
    partialize: (state) => ({
      userId: state.userId,
      conversationId: state.conversationId,
    }),
  })
);
