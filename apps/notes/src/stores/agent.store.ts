import { aiQuotaQueryKeys, quotaStateOf } from '@/hooks/useAiQuota';
import { refreshModelChoice } from '@/hooks/useProviderKeys';
import { captureProductEvent } from '@/lib/analytics/product-events';
import { queryClient } from '@/lib/query-client';
import { create, type StoreApi } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  agentClient,
  conversationsApi,
  isDecisionNotTaken,
  type AgentErrorPayload,
  type AgentSource,
  type AgentStreamCallbacks,
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
  AGENT_TURN_ERROR_CODE,
  AGENT_TURN_NOT_CONTINUABLE_CODE,
  AI_BYOK_KEY_FAILED_CODE,
  AI_INVALID_INPUT_CODE,
  AI_MODEL_UNAVAILABLE_CODE,
  AI_QUOTA_EXHAUSTED_CODE,
  deriveConversationTitle,
  isAgentStopReason,
  isContinuableStop,
  isModelFallbackReason,
  MESSAGE_KIND,
  type AgentStopReason,
  type AiQuota,
  type MessageKind,
  type ModelFallbackReason,
  type ModelResolution,
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

/** The model that answered a reply in place of the one its turn asked for. */
export interface ReplyModelFallback {
  /** Absent when a newer server sent a reason this build does not know. */
  reason?: ModelFallbackReason;
  to: string;
}

export interface AgentChatMessage {
  id: string;
  /** Absent only on history written before turns had ids. */
  turnId?: string;
  role: 'user' | 'assistant';
  content: string;
  /** `continue` marks a user row with no text that asked the model to pick up the turn before it. */
  kind?: MessageKind;
  stopReason?: AgentStopReason;
  sources?: AgentSource[];
  webSources?: WebSource[];
  proposal?: { kind: PendingProposal['kind'] };
  committed?: { kind: PendingProposal['kind']; title: string };
  discarded?: boolean;
  /** The stored leg this bubble shows was cut off by an abort or an error. */
  interrupted?: boolean;
  /** Only the live `agent:done` reports it; the stored transcript does not, so a refetched thread drops it. */
  modelFallback?: ReplyModelFallback;
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

export interface NewConversationOptions {
  keepDraft?: boolean;
}

export interface SessionUser {
  id: string;
  isAnonymous?: boolean;
}

export function keepsDraftAcrossSwitch(
  from: Pick<SessionUser, 'isAnonymous'> | null,
  to: Pick<SessionUser, 'isAnonymous'>
): boolean {
  return from?.isAnonymous === true && to.isAnonymous !== true;
}

const TURN_ALIVE_STATUSES = [
  'streaming',
  'pendingProposal',
] as const satisfies readonly AgentStatus[];

/** A turn is alive while the server may still stream for it: a send must queue, not replace. */
export function isTurnAlive(status: AgentStatus): boolean {
  return (TURN_ALIVE_STATUSES as readonly AgentStatus[]).includes(status);
}

/** The part of the state `selectContinuableAnswer` reads. */
export interface ContinueOfferView {
  messages: readonly AgentChatMessage[];
  status: AgentStatus;
  continuableTurnId: string | null;
}

/**
 * The answer to offer "Continuar" under: the last message, while it is the
 * answer of the turn the server would continue and no turn is running. It
 * returns a message held in the state, so it is a stable Zustand selector.
 */
export function selectContinuableAnswer(
  state: ContinueOfferView
): AgentChatMessage | null {
  const last = state.messages.at(-1);
  return state.continuableTurnId !== null &&
    !isTurnAlive(state.status) &&
    last !== undefined &&
    last.role === 'assistant' &&
    last.turnId === state.continuableTurnId
    ? last
    : null;
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

const TURN_INTERRUPTED_ERROR: AgentErrorPayload = {
  code: 'AGENT_TURN_INTERRUPTED',
  message: 'The stored answer was cut off',
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
  /** The proposal a sent approve or reject is deciding, kept until the turn ends so a refusal can give its card back. */
  decisionInFlight: DecisionInFlight | null;
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
  /** The stored turn a continue request may resume now; null when none can. */
  continuableTurnId: string | null;
  _streamHandle: AgentStreamHandle | null;
  setReasoningEffort: (effort: CopilotEffort) => void;
  bindUser: (user: SessionUser) => void;
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
  newConversation: (options?: NewConversationOptions) => void;
  cancel: () => void;
  retryLast: () => void;
  /** Continues `continuableTurnId`; a no-op while a turn runs or when none can be continued. */
  continueTurn: (noteId?: string) => void;
  approveProposal: () => void;
  rejectProposal: (reason?: string) => void;
}

type SetAgentState = StoreApi<AgentState>['setState'];
type GetAgentState = StoreApi<AgentState>['getState'];

interface PersistedConversation {
  userId: string;
  conversationId: string | null;
}

export interface DecisionInFlight {
  readonly proposal: PendingProposal;
  readonly discardedId: string | undefined;
}

function isUnresumedDecision(error: AgentErrorPayload): boolean {
  return (
    error.code === AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE &&
    error.turnId !== undefined
  );
}

function refusedBeforeRun(error: AgentErrorPayload): boolean {
  return (
    error.code === AI_INVALID_INPUT_CODE ||
    error.code === AI_QUOTA_EXHAUSTED_CODE ||
    error.code === AI_MODEL_UNAVAILABLE_CODE
  );
}

const TURN_REQUEST_KIND = {
  MESSAGE: 'message',
  CONTINUE: 'continue',
} as const;

type TurnRequest =
  | { kind: typeof TURN_REQUEST_KIND.MESSAGE; text: string }
  | { kind: typeof TURN_REQUEST_KIND.CONTINUE; continuesTurnId: string };

// The server refuses these again on every click: the thread moved on, or the
// history no longer fits a turn, so the offer is withdrawn instead of returned.
const CONTINUATION_ENDING_CODES: ReadonlySet<string> = new Set([
  AGENT_TURN_NOT_CONTINUABLE_CODE,
  AI_INVALID_INPUT_CODE,
]);

function hasAnswered(message: AgentChatMessage): boolean {
  return (
    message.content.length > 0 ||
    message.proposal !== undefined ||
    message.stopReason !== undefined
  );
}

function continuedTurnOf(
  messages: readonly AgentChatMessage[],
  markerIndex: number
): string | undefined {
  return messages
    .slice(0, markerIndex)
    .findLast((m) => m.role === 'assistant' && m.turnId !== undefined)?.turnId;
}

function withInterruptedReply(
  messages: readonly AgentChatMessage[],
  id: string | null
): AgentChatMessage[] {
  return messages.map((m) =>
    m.id === id && m.content.length > 0 ? { ...m, interrupted: true } : m
  );
}

function offersNoResend(error: AgentErrorPayload): boolean {
  return (
    refusedBeforeRun(error) ||
    error.code === AI_BYOK_KEY_FAILED_CODE ||
    error.code === AGENT_TURN_NOT_CONTINUABLE_CODE
  );
}

function joinDraft(...parts: readonly (string | null)[]): string {
  return parts
    .filter((part): part is string => part !== null && part.trim().length > 0)
    .join(DRAFT_PARAGRAPH_SEPARATOR);
}

function queuedTexts(queue: readonly QueuedMessage[]): string[] {
  return queue.map((queued) => queued.text);
}

function invalidateQuota(): void {
  void queryClient.invalidateQueries({ queryKey: aiQuotaQueryKeys.all });
}

function replyFallbackOf(
  fallback: NonNullable<ModelResolution['fallback']>
): ReplyModelFallback {
  return {
    to: fallback.to,
    ...(isModelFallbackReason(fallback.reason)
      ? { reason: fallback.reason }
      : {}),
  };
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
  let boundUser: SessionUser | null = null;
  let liveContinuation: { continuesTurnId: string; turnId: string } | null =
    null;

  const streamingReplyId = (status: AgentStatus): string | null =>
    status === 'streaming' ? activeAssistantId : null;

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
      cancelStream();
      thinkingBuffer.discard();
      set((s) => ({
        status: 'timeout',
        retryMode: resumingDecision ? 'none' : 'resend',
        _streamHandle: null,
        thinkingText: '',
        decisionInFlight: null,
        messages: withInterruptedReply(s.messages, streamingReplyId(s.status)),
      }));
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

  const restoreDecision = (
    error: AgentErrorPayload,
    { proposal, discardedId }: DecisionInFlight
  ) => {
    const id = activeAssistantId;
    set((s) => ({
      status: 'pendingProposal',
      error,
      retryMode: 'none',
      pendingProposal: proposal,
      decisionInFlight: null,
      thinkingText: '',
      messages: s.messages
        .filter((m) => m.id !== id)
        .map((m) => (m.id === discardedId ? { ...m, discarded: false } : m)),
    }));
  };

  const endUnresumedDecision = () => {
    const id = activeAssistantId;
    set((s) => ({
      status: 'done',
      _streamHandle: null,
      thinkingText: '',
      decisionInFlight: null,
      messages: withInterruptedReply(
        s.messages.filter(
          (m) =>
            m.id !== id || m.content.length > 0 || m.committed !== undefined
        ),
        id
      ),
    }));
    drainQueue();
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

  // Cancelling drops the socket, and with it any `agent:quota` push still on
  // its way for a turn the server goes on charging.
  const cancelStream = () => {
    get()._streamHandle?.cancel();
    if (isTurnAlive(get().status)) {
      invalidateQuota();
    }
  };

  const abandonTurn = () => {
    cancelStream();
    streamVersion++;
    buffer.clearInactivityTimer();
    buffer.discard();
    thinkingBuffer.discard();
    activeAssistantId = null;
    unsentText = null;
    liveContinuation = null;
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
      decisionInFlight: null,
      thinkingText: '',
      _streamHandle: null,
      conversationId: null,
      conversationTitle: null,
      hydration: 'unloaded',
      hasEarlier: false,
      continuableTurnId: null,
      draft: joinDraft(returned, s.draft),
    }));
  };

  const withoutActiveTurn = (
    messages: readonly AgentChatMessage[]
  ): AgentChatMessage[] => {
    const index = messages.findIndex((m) => m.id === activeAssistantId);
    if (index === -1) {
      return [...messages];
    }
    const active = messages[index];
    const opener = index > 0 ? messages[index - 1] : undefined;
    const openerId = opener?.role === 'user' ? opener.id : undefined;
    return messages.filter(
      (m) =>
        m.id !== active.id &&
        m.id !== openerId &&
        (active.turnId === undefined || m.turnId !== active.turnId)
    );
  };

  const activeAnswered = (): boolean => {
    const answer = get().messages.find((m) => m.id === activeAssistantId);
    return answer !== undefined && hasAnswered(answer);
  };

  // The server stores nothing for a continuation that never answered, so no
  // refetch would ever take its marker off a thread that moved on without it.
  const withoutUnansweredContinuation = (
    messages: readonly AgentChatMessage[]
  ): AgentChatMessage[] => {
    const turnId = liveContinuation?.turnId;
    const unanswered =
      turnId !== undefined &&
      !messages.some((m) => m.turnId === turnId && hasAnswered(m));
    return unanswered
      ? messages.filter((m) => m.turnId !== turnId)
      : [...messages];
  };

  const takeBackRefusedTurn = (
    error: AgentErrorPayload,
    continuableTurnId: string | null
  ) => {
    const returned = unsentText;
    unsentText = null;
    const lockedOut = error.code === AI_QUOTA_EXHAUSTED_CODE;
    set((s) => ({
      status: 'error',
      error,
      retryMode: 'none',
      _streamHandle: null,
      thinkingText: '',
      decisionInFlight: null,
      continuableTurnId,
      messages: withoutActiveTurn(s.messages),
      queue: lockedOut ? [] : s.queue,
      draft: joinDraft(
        returned,
        ...(lockedOut ? queuedTexts(s.queue) : []),
        s.draft
      ),
    }));
    activeAssistantId = null;
  };

  const run = (
    request: TurnRequest,
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
    const callbacks: AgentStreamCallbacks = {
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
          ...(request.kind === TURN_REQUEST_KIND.MESSAGE
            ? { conversationTitle: deriveConversationTitle(request.text) }
            : {}),
        });
      },
      onDone: ({
        sources,
        webSources,
        stopReason,
        continuable,
        modelResolution,
      }) => {
        if (version !== streamVersion || get().status !== 'streaming') {
          return;
        }
        invalidateConversations(queryClient);
        invalidateQuota();
        const fallback = modelResolution?.fallback;
        if (fallback) {
          refreshModelChoice(queryClient);
        }
        buffer.clearInactivityTimer();
        buffer.flush();
        thinkingBuffer.discard();
        const id = activeAssistantId;
        set((s) => {
          const answer = s.messages.find((m) => m.id === id);
          return {
            status: 'done',
            _streamHandle: null,
            thinkingText: '',
            decisionInFlight: null,
            continuableTurnId:
              continuable === true ? (answer?.turnId ?? null) : null,
            messages: s.messages.map((m) =>
              m.id === id
                ? {
                    ...m,
                    sources,
                    webSources,
                    ...(isAgentStopReason(stopReason) ? { stopReason } : {}),
                    ...(fallback
                      ? { modelFallback: replyFallbackOf(fallback) }
                      : {}),
                  }
                : m
            ),
          };
        });
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
        invalidateQuota();
        if (error.code === AI_MODEL_UNAVAILABLE_CODE) {
          refreshModelChoice(queryClient);
        }
        buffer.clearInactivityTimer();
        buffer.flush();
        thinkingBuffer.discard();
        if (error.code === AGENT_CONVERSATION_NOT_FOUND_CODE) {
          forgetGoneConversation(error);
          return;
        }
        if (
          request.kind === TURN_REQUEST_KIND.CONTINUE &&
          !resumingDecision &&
          !activeAnswered()
        ) {
          takeBackRefusedTurn(
            error,
            CONTINUATION_ENDING_CODES.has(error.code)
              ? null
              : request.continuesTurnId
          );
          if (error.code === AGENT_TURN_NOT_CONTINUABLE_CODE) {
            void refreshThread();
          }
          return;
        }
        if (!resumingDecision && refusedBeforeRun(error)) {
          takeBackRefusedTurn(error, null);
          return;
        }
        const inFlight = get().decisionInFlight;
        if (resumingDecision && inFlight && isDecisionNotTaken(error)) {
          restoreDecision(error, inFlight);
          return;
        }
        if (resumingDecision && isUnresumedDecision(error)) {
          endUnresumedDecision();
          return;
        }
        set((s) => ({
          status: 'error',
          error,
          retryMode:
            resumingDecision ||
            request.kind === TURN_REQUEST_KIND.CONTINUE ||
            offersNoResend(error)
              ? 'none'
              : 'resend',
          _streamHandle: null,
          thinkingText: '',
          decisionInFlight: null,
          messages: withInterruptedReply(
            s.messages,
            streamingReplyId(s.status)
          ),
        }));
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
          decisionInFlight: null,
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
          decisionInFlight: null,
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
        set({
          _streamHandle: null,
          thinkingText: '',
          decisionInFlight: null,
        });
        void showStoredAnswer(turnId);
      },
    };
    const handle =
      request.kind === TURN_REQUEST_KIND.MESSAGE
        ? agentClient.sendMessage(request.text, callbacks, noteId, options)
        : agentClient.continueTurn(
            request.continuesTurnId,
            callbacks,
            noteId,
            options
          );
    if (get().status === 'streaming') {
      buffer.armInactivityTimer();
      set({ _streamHandle: handle });
    }
    return handle;
  };

  const beginTurn = (
    request: TurnRequest,
    noteId?: string,
    resentTurnId?: string
  ): string => {
    const current = get();
    if (current.status === 'streaming' && current._streamHandle) {
      current._streamHandle.cancel();
    }
    streamVersion++;
    lastNoteId = noteId;
    unsentText =
      request.kind === TURN_REQUEST_KIND.MESSAGE ? request.text : null;
    resumingDecision = false;
    buffer.clearInactivityTimer();
    buffer.flush();
    thinkingBuffer.discard();
    const thread = withInterruptedReply(
      withoutUnansweredContinuation(get().messages),
      streamingReplyId(current.status)
    );
    liveContinuation = null;

    const userMessage: AgentChatMessage =
      request.kind === TURN_REQUEST_KIND.MESSAGE
        ? { id: nextId(), role: 'user', content: request.text }
        : {
            id: nextId(),
            role: 'user',
            content: '',
            kind: MESSAGE_KIND.CONTINUE,
          };
    const assistantMessage: AgentChatMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
    };

    set({
      messages: [...thread, userMessage, assistantMessage],
      status: 'streaming',
      error: null,
      pendingProposal: null,
      decisionInFlight: null,
      thinkingText: '',
      continuableTurnId: null,
      _streamHandle: null,
    });

    const { turnId } = run(request, assistantMessage.id, noteId, resentTurnId);
    liveTurnId = turnId;
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === userMessage.id || m.id === assistantMessage.id
          ? { ...m, turnId }
          : m
      ),
    }));
    return turnId;
  };

  const startTurn = (text: string, noteId?: string, resentTurnId?: string) => {
    beginTurn({ kind: TURN_REQUEST_KIND.MESSAGE, text }, noteId, resentTurnId);
  };

  const startContinuation = (
    continuesTurnId: string,
    noteId?: string,
    resentTurnId?: string
  ) => {
    const turnId = beginTurn(
      { kind: TURN_REQUEST_KIND.CONTINUE, continuesTurnId },
      noteId,
      resentTurnId
    );
    liveContinuation = { continuesTurnId, turnId };
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
    const streamAtRequest = streamVersion;
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
      const adoptsOffer =
        inProgress.length === 0 && streamVersion === streamAtRequest;
      set((s) => ({
        messages: mergeTranscript(
          toChatMessages(transcript.messages, nextId),
          s.messages,
          inProgress
        ),
        ...(adoptsOffer
          ? { continuableTurnId: transcript.continuableTurnId ?? null }
          : {}),
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

  const hasStoredAnswer = (turnId: string | undefined): boolean => {
    const answer = get().messages.findLast(
      (m) =>
        m.turnId === turnId &&
        m.role === 'assistant' &&
        (m.content.length > 0 || m.stopReason !== undefined)
    );
    return answer !== undefined && answer.interrupted !== true;
  };

  const showStoredAnswer = async (turnId: string | undefined) => {
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
    if (
      outcome === 'superseded' ||
      (outcome === 'loaded' && hasStoredAnswer(turnId))
    ) {
      set({ status: 'done' });
      drainQueue();
      return;
    }
    // Shown as done, a turn stored cut off or without an answer would pass for
    // a whole reply. The server has ended it, so its retry is a new turn.
    const loaded = outcome === 'loaded';
    const waitingId = activeAssistantId;
    set((s) => ({
      status: 'error',
      error: loaded ? TURN_INTERRUPTED_ERROR : ANSWER_UNAVAILABLE_ERROR,
      retryMode: loaded ? 'resend' : 'reload',
      messages: s.messages.filter(
        (m) => m.id !== waitingId || m.content.length > 0
      ),
    }));
  };

  const quotaKnownSpent = (): boolean => {
    const { userId } = get();
    if (userId === null) {
      return false;
    }
    const quota = quotaStateOf(
      queryClient.getQueryData<AiQuota>(aiQuotaQueryKeys.forUser(userId))
    );
    return quota.kind === 'metered' && quota.exhausted;
  };

  const drainQueue = () => {
    const [next, ...rest] = get().queue;
    if (!next) {
      return;
    }
    if (quotaKnownSpent()) {
      set((s) => ({
        queue: [],
        draft: joinDraft(...queuedTexts(s.queue), s.draft),
      }));
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
    decisionInFlight: null,
    thinkingText: '',
    reasoningEffort: 'auto',
    userId: null,
    conversationId: null,
    conversationTitle: null,
    hydration: 'unloaded',
    hasEarlier: false,
    retryMode: 'resend',
    continuableTurnId: null,
    _streamHandle: null,

    setReasoningEffort: (effort) => set({ reasoningEffort: effort }),

    bindUser: (user) => {
      const keepDraft = keepsDraftAcrossSwitch(boundUser, user);
      boundUser = user;
      const { userId: boundUserId, conversationId } = get();
      if (boundUserId === user.id) {
        return;
      }
      if (boundUserId !== null || conversationId !== null) {
        get().newConversation({ keepDraft });
      }
      set({ userId: user.id });
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
        continuableTurnId: null,
        pendingProposal: null,
        decisionInFlight: null,
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

    newConversation: (options) => {
      abandonTurn();
      threadVersion++;
      agentClient.resetConversation();
      set((s) => ({
        messages: [],
        queue: [],
        draft: options?.keepDraft ? s.draft : '',
        status: 'idle',
        error: null,
        retryMode: 'resend',
        pendingProposal: null,
        decisionInFlight: null,
        thinkingText: '',
        reasoningEffort: 'auto',
        conversationId: null,
        conversationTitle: null,
        hydration: 'unloaded',
        hasEarlier: false,
        continuableTurnId: null,
        _streamHandle: null,
      }));
    },

    cancel: () => {
      const { status } = get();
      cancelStream();
      streamVersion++;
      buffer.clearInactivityTimer();
      buffer.flush();
      thinkingBuffer.discard();
      const restored =
        isTurnAlive(status) && !resumingDecision && !activeAnswered()
          ? liveContinuation?.continuesTurnId
          : undefined;
      const cutReply = streamingReplyId(status);
      set((s) => ({
        status: 'idle',
        pendingProposal: null,
        decisionInFlight: null,
        thinkingText: '',
        _streamHandle: null,
        ...(restored === undefined
          ? { messages: withInterruptedReply(s.messages, cutReply) }
          : {
              messages: withoutActiveTurn(s.messages),
              continuableTurnId: restored,
            }),
      }));
      activeAssistantId = null;
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
        void showStoredAnswer(failed.turnId);
        return;
      }
      const resentTurnId =
        failed.turnId !== undefined && agentClient.canResendTurn(failed.turnId)
          ? failed.turnId
          : undefined;
      if (failed.kind === MESSAGE_KIND.CONTINUE) {
        const continuesTurnId = continuedTurnOf(messages, lastUserIdx);
        if (continuesTurnId === undefined) {
          return;
        }
        set({ messages: messages.slice(0, lastUserIdx) });
        startContinuation(continuesTurnId, lastNoteId, resentTurnId);
        return;
      }
      set({ messages: messages.slice(0, lastUserIdx) });
      startTurn(failed.content, lastNoteId, resentTurnId);
    },

    continueTurn: (noteId) => {
      const { continuableTurnId, status, messages, userId } = get();
      if (continuableTurnId === null || isTurnAlive(status)) {
        return;
      }
      const stopReason = messages.findLast(
        (m) => m.role === 'assistant' && m.turnId === continuableTurnId
      )?.stopReason;
      const tier =
        userId === null
          ? undefined
          : queryClient.getQueryData<AiQuota>(aiQuotaQueryKeys.forUser(userId))
              ?.tier;
      captureProductEvent('ai continue clicked', {
        ...(tier ? { tier } : {}),
        ...(isContinuableStop(stopReason) ? { stop_reason: stopReason } : {}),
      });
      const previous = liveContinuation;
      const resentTurnId =
        previous !== null &&
        previous.continuesTurnId === continuableTurnId &&
        agentClient.canResendTurn(previous.turnId)
          ? previous.turnId
          : undefined;
      startContinuation(continuableTurnId, noteId, resentTurnId);
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
        error: null,
        pendingProposal: null,
        decisionInFlight: { proposal: p, discardedId: undefined },
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
      const discardedId = get().messages.findLast(
        (m) => m.proposal && !m.committed && !m.discarded
      )?.id;
      set((s) => ({
        status: 'streaming',
        error: null,
        pendingProposal: null,
        decisionInFlight: { proposal: p, discardedId },
        thinkingText: '',
        messages: [
          ...s.messages.map((m) =>
            m.id === discardedId ? { ...m, discarded: true } : m
          ),
          assistant,
        ],
      }));
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
