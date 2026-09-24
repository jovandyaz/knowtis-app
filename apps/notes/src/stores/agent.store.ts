import { captureProductEvent } from '@/lib/analytics/product-events';
import { queryClient } from '@/lib/query-client';
import { create, type StoreApi } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
  AGENT_CONVERSATION_NOT_FOUND_CODE,
  deriveConversationTitle,
  type AgentStopReason,
  type ReasoningEffort,
} from '@knowtis/shared-types';
import {
  COPILOT_CONVERSATION_STORAGE_KEY,
  safeLocalStorage,
} from '@knowtis/shared-util';

import { createChunkBuffer } from './chunk-buffer';
import { toChatMessages } from './conversation-transcript';
import { mergeTranscript } from './merge-transcript';

/** 'auto' leaves the reasoning budget to the server. */
export type CopilotEffort = 'auto' | ReasoningEffort;

export type ConversationHydration =
  | 'unloaded'
  | 'loading'
  | 'loaded'
  | 'failed';

export type ConversationOpenSource = 'switcher' | 'reload';

/**
 * What `retryLast` does with the failure on screen: send the message again,
 * load the answer the server already stored for it, or nothing, because the
 * failed leg resumed a decision whose message already ran.
 */
export type RetryMode = 'resend' | 'reload' | 'none';

type HydrationOutcome = 'loaded' | 'gone' | 'failed' | 'superseded';

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
  turnId?: string;
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
  /** Absent only on history written before turns had ids. */
  turnId?: string;
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
const DRAFT_PARAGRAPH_SEPARATOR = '\n\n';

/** Local failure only: whether the proposal itself expired is the server's to say. */
const RESUME_UNAVAILABLE_ERROR: AgentErrorPayload = {
  code: 'AGENT_RESUME_UNAVAILABLE',
  message: 'The turn is no longer open to resume',
};

const ANSWER_UNAVAILABLE_ERROR: AgentErrorPayload = {
  code: 'AGENT_ANSWER_UNAVAILABLE',
  message: 'The stored answer could not be loaded',
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
  retryMode: RetryMode;
  _streamHandle: AgentStreamHandle | null;
  setReasoningEffort: (effort: CopilotEffort) => void;
  bindUser: (userId: string) => void;
  setConversationTitle: (title: string) => void;
  openConversation: (
    id: string,
    source: ConversationOpenSource
  ) => Promise<ConversationOpenOutcome>;
  /** Re-fetches the open conversation and merges it; never clears messages or the running turn. */
  retryHydration: () => Promise<void>;
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

interface PersistedConversation {
  userId: string;
  conversationId: string | null;
}

function isPersistedConversation(
  value: unknown
): value is PersistedConversation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'userId' in value &&
    typeof value.userId === 'string' &&
    'conversationId' in value &&
    (value.conversationId === null || typeof value.conversationId === 'string')
  );
}

function createAgentState(set: SetAgentState, get: GetAgentState): AgentState {
  let seq = 0;
  const nextId = () => `m${++seq}`;

  let activeAssistantId: string | null = null;
  let liveTurnId: string | undefined;
  let resumingDecision = false;
  let streamVersion = 0;
  let threadVersion = 0;
  let hydrationRequest = 0;
  let storedAnswerWait: { version: number; abort: AbortController } | undefined;
  let lastNoteId: string | undefined;
  let unsentText: string | null = null;
  let titleEdits = 0;

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
      // A stored answer that never arrives must end like one that failed to load.
      if (storedAnswerWait?.version === streamVersion) {
        storedAnswerWait.abort.abort();
        return;
      }
      get()._streamHandle?.cancel();
      thinkingBuffer.discard();
      set({
        status: 'timeout',
        retryMode: resumingDecision ? 'none' : 'resend',
        _streamHandle: null,
        thinkingText: '',
      });
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
    unsentText = null;
    resumingDecision = true;
    const assistant: AgentChatMessage = {
      id: nextId(),
      ...(liveTurnId ? { turnId: liveTurnId } : {}),
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
      retryMode: 'none',
      pendingProposal: null,
      thinkingText: '',
      _streamHandle: null,
    });
  };

  const abandonTurn = () => {
    get()._streamHandle?.cancel();
    streamVersion++;
    buffer.clearInactivityTimer();
    buffer.discard();
    thinkingBuffer.discard();
    activeAssistantId = null;
    unsentText = null;
  };

  const forgetGoneConversation = (error: AgentErrorPayload) => {
    threadVersion++;
    const returned = unsentText;
    unsentText = null;
    activeAssistantId = null;
    agentClient.resetConversation();
    set((s) => ({
      messages: [],
      status: 'idle',
      error,
      pendingProposal: null,
      thinkingText: '',
      _streamHandle: null,
      conversationId: null,
      conversationTitle: null,
      hydration: 'unloaded',
      hasEarlier: false,
      draft: [returned, s.draft]
        .filter(
          (part): part is string => part !== null && part.trim().length > 0
        )
        .join(DRAFT_PARAGRAPH_SEPARATOR),
    }));
  };

  const run = (
    text: string,
    assistantId: string,
    noteId?: string,
    resentTurnId?: string
  ): AgentStreamHandle => {
    activeAssistantId = assistantId;
    const version = streamVersion;
    const storeEffort = get().reasoningEffort;
    const effort = storeEffort === 'auto' ? undefined : storeEffort;
    const options = {
      ...(effort ? { effort } : {}),
      ...(resentTurnId ? { turnId: resentTurnId } : {}),
    };
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
          invalidateConversations(queryClient);
          buffer.clearInactivityTimer();
          buffer.flush();
          thinkingBuffer.discard();
          if (error.code === AGENT_CONVERSATION_NOT_FOUND_CODE) {
            forgetGoneConversation(error);
            return;
          }
          set({
            status: 'error',
            error,
            retryMode: resumingDecision ? 'none' : 'resend',
            _streamHandle: null,
            thinkingText: '',
          });
        },
        onProposal: (proposal) => {
          if (version !== streamVersion) {
            return;
          }
          invalidateConversations(queryClient);
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
        onTurnSettled: ({ turnId }) => {
          if (version !== streamVersion) {
            return;
          }
          invalidateConversations(queryClient);
          // The transcript carries no pending proposal, so a card of this
          // turn the user can still decide on must outlive the refetch.
          if (get().pendingProposal?.turnId === turnId) {
            void refreshThread();
            return;
          }
          buffer.clearInactivityTimer();
          buffer.flush();
          thinkingBuffer.discard();
          set({ _streamHandle: null, thinkingText: '' });
          void showStoredAnswer();
        },
      },
      noteId,
      options
    );
    if (get().status === 'streaming') {
      buffer.armInactivityTimer();
      set({ _streamHandle: handle });
    }
    return handle;
  };

  const startTurn = (text: string, noteId?: string, resentTurnId?: string) => {
    const current = get();
    if (current.status === 'streaming' && current._streamHandle) {
      current._streamHandle.cancel();
    }
    streamVersion++;
    lastNoteId = noteId;
    unsentText = text;
    resumingDecision = false;
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
    });

    const { turnId } = run(text, assistantMessage.id, noteId, resentTurnId);
    liveTurnId = turnId;
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === userMessage.id || m.id === assistantMessage.id
          ? { ...m, turnId }
          : m
      ),
    }));
  };

  const turnInProgress = () =>
    isTurnAlive(get().status) ? liveTurnId : undefined;

  const hydrate = async (
    id: string,
    failedState: ConversationHydration = 'failed',
    signal?: AbortSignal
  ): Promise<HydrationOutcome> => {
    const thread = threadVersion;
    const request = ++hydrationRequest;
    const titleEditsAtRequest = titleEdits;
    // A turn in progress when the server read the thread may have finished
    // since, and the transcript then holds only the part stored before.
    const inProgressAtRequest = turnInProgress();
    const superseded = () =>
      thread !== threadVersion || request !== hydrationRequest;
    set({ hydration: 'loading' });
    try {
      const transcript = await conversationsApi.transcript(id, signal);
      if (superseded()) {
        return 'superseded';
      }
      const inProgress = [inProgressAtRequest, turnInProgress()].filter(
        (turnId): turnId is string => turnId !== undefined
      );
      set((s) => ({
        messages: mergeTranscript(
          toChatMessages(transcript.messages, nextId),
          s.messages,
          inProgress
        ),
        ...(titleEdits === titleEditsAtRequest
          ? { conversationTitle: transcript.title }
          : {}),
        hasEarlier: transcript.hasEarlier,
        hydration: 'loaded',
      }));
      return 'loaded';
    } catch (error) {
      if (superseded()) {
        return 'superseded';
      }
      if (isConversationGone(error)) {
        return 'gone';
      }
      set({ hydration: failedState });
      return 'failed';
    }
  };

  /** A refetch the user did not ask for: when it fails, the thread stays as it was shown. */
  const refreshThread = async (
    signal?: AbortSignal
  ): Promise<HydrationOutcome> => {
    const { conversationId, hydration } = get();
    if (!conversationId) {
      return 'failed';
    }
    const shown = hydration === 'loading' ? 'failed' : hydration;
    const outcome = await hydrate(conversationId, shown, signal);
    if (outcome === 'gone') {
      set({ hydration: shown });
    }
    return outcome;
  };

  const showStoredAnswer = async () => {
    // The stored answer replaces this turn's live bubbles, so it must not win the merge.
    liveTurnId = undefined;
    const version = streamVersion;
    const abort = new AbortController();
    storedAnswerWait = { version, abort };
    buffer.armInactivityTimer();
    const outcome = await refreshThread(abort.signal);
    if (version !== streamVersion) {
      return;
    }
    buffer.clearInactivityTimer();
    storedAnswerWait = undefined;
    if (outcome === 'loaded' || outcome === 'superseded') {
      set({ status: 'done' });
      drainQueue();
      return;
    }
    const waitingId = activeAssistantId;
    set((s) => ({
      status: 'error',
      error: ANSWER_UNAVAILABLE_ERROR,
      retryMode: 'reload',
      messages: s.messages.filter(
        (m) => m.id !== waitingId || m.content.length > 0
      ),
    }));
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
    hydration: 'unloaded',
    hasEarlier: false,
    retryMode: 'resend',
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

    setConversationTitle: (title) => {
      titleEdits++;
      set({ conversationTitle: title });
    },

    openConversation: async (id, source) => {
      const current = get();
      if (
        id === current.conversationId &&
        (current.hydration === 'loading' || current.messages.length > 0)
      ) {
        return 'unchanged';
      }
      abandonTurn();
      const version = streamVersion;
      threadVersion++;
      agentClient.resumeConversation(id);
      const switching = id !== current.conversationId;
      set({
        conversationId: id,
        conversationTitle: switching ? null : current.conversationTitle,
        messages: [],
        queue: [],
        status: 'idle',
        error: null,
        retryMode: 'resend',
        pendingProposal: null,
        thinkingText: '',
        _streamHandle: null,
        hydration: 'loading',
        hasEarlier: false,
        ...(switching ? { reasoningEffort: 'auto' as const } : {}),
      });
      const outcome = await hydrate(id);
      switch (outcome) {
        case 'loaded':
          captureProductEvent('ai conversation opened', { source });
          return 'opened';
        case 'gone':
          // Forgetting the thread here would strand the turn sent meanwhile:
          // its own not-found error is what gives its text back to the draft.
          if (version !== streamVersion) {
            set({ hydration: 'unloaded' });
            return 'superseded';
          }
          agentClient.resetConversation();
          set({
            conversationId: null,
            conversationTitle: null,
            hydration: 'unloaded',
          });
          return 'gone';
        case 'failed':
        case 'superseded':
          return outcome;
        default: {
          const exhaustive: never = outcome;
          throw new Error(`Unhandled hydration outcome: ${String(exhaustive)}`);
        }
      }
    },

    retryHydration: async () => {
      const { conversationId } = get();
      if (!conversationId) {
        return;
      }
      if ((await hydrate(conversationId)) === 'gone') {
        set({ hydration: 'unloaded' });
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
      abandonTurn();
      threadVersion++;
      agentClient.resetConversation();
      set({
        messages: [],
        queue: [],
        draft: '',
        status: 'idle',
        error: null,
        retryMode: 'resend',
        pendingProposal: null,
        thinkingText: '',
        reasoningEffort: 'auto',
        conversationId: null,
        conversationTitle: null,
        hydration: 'unloaded',
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
      const { messages, retryMode } = get();
      if (retryMode === 'none') {
        return;
      }
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
      const failed = messages[lastUserIdx];
      if (retryMode === 'reload') {
        const waiting: AgentChatMessage = {
          id: nextId(),
          ...(failed.turnId ? { turnId: failed.turnId } : {}),
          role: 'assistant',
          content: '',
        };
        activeAssistantId = waiting.id;
        set((s) => ({
          status: 'streaming',
          error: null,
          messages: [...s.messages, waiting],
        }));
        void showStoredAnswer();
        return;
      }
      const resentTurnId =
        failed.turnId !== undefined && agentClient.canResendTurn(failed.turnId)
          ? failed.turnId
          : undefined;
      set({ messages: messages.slice(0, lastUserIdx) });
      startTurn(failed.content, lastNoteId, resentTurnId);
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
    storage: createJSONStorage(() => safeLocalStorage),
    partialize: (state) => ({
      userId: state.userId,
      conversationId: state.conversationId,
    }),
    merge: (persisted, current) =>
      isPersistedConversation(persisted)
        ? {
            ...current,
            userId: persisted.userId,
            conversationId: persisted.conversationId,
          }
        : current,
  })
);
