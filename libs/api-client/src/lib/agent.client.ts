import { io, type Socket } from 'socket.io-client';

import {
  AGENT_TURN_ERROR_CODE,
  type AgentStopReason,
  type ReasoningEffort,
} from '@knowtis/shared-types';
import { logger } from '@knowtis/shared-util';

import type { TokenProvider } from './http-client';
import {
  createTokenRefreshPolicy,
  type RefreshOutcome,
  type TokenRefreshPolicy,
} from './token-refresh-policy';
import { deriveWsBaseUrl } from './ws-url';

export interface AgentSource {
  id: string;
  title: string;
}

export interface WebSource {
  title: string;
  url: string;
}

export interface AgentChunkPayload {
  turnId?: string;
  text: string;
}

export interface AgentThinkingPayload {
  turnId?: string;
  text: string;
}

interface AgentUsagePayload {
  inputTokens: number;
  outputTokens: number;
  model: string;
  costUsd: number;
}

export interface AgentConversationPayload {
  turnId?: string;
  conversationId: string;
}

export interface AgentDonePayload {
  turnId?: string;
  usage: AgentUsagePayload;
  sources: AgentSource[];
  knownNotes: AgentSource[];
  webSources: WebSource[];
  stopReason: AgentStopReason;
  conversationId?: string;
}

export interface AgentErrorPayload {
  code: string;
  message: string;
  turnId?: string;
}

export interface AgentProposalPayload {
  turnId?: string;
  id: string;
  kind: 'create' | 'update' | 'share';
  targetNoteId: string | null;
  summary: string;
  payload: Record<string, unknown>;
}

export interface AgentCommittedPayload {
  turnId?: string;
  proposalId: string;
  result: {
    noteId: string;
    title: string;
    kind: 'create' | 'update' | 'share';
  };
}

export interface AgentTurnSettledPayload {
  turnId: string;
  conversationId: string;
}

interface AgentStreamCallbacks {
  onChunk: (payload: AgentChunkPayload) => void;
  onThinking?: (payload: AgentThinkingPayload) => void;
  onDone: (payload: AgentDonePayload) => void;
  onConversation?: (conversationId: string) => void;
  onError: (payload: AgentErrorPayload) => void;
  onProposal?: (payload: AgentProposalPayload) => void;
  onCommitted?: (payload: AgentCommittedPayload) => void;
  onTurnSettled?: (payload: AgentTurnSettledPayload) => void;
}

export interface AgentStreamHandle {
  turnId: string;
  cancel: () => void;
}

/** Per-message knobs for `sendMessage`. */
export interface AgentSendOptions {
  /**
   * Reasoning effort for this turn, one of `REASONING_EFFORTS`
   * (`low | medium | high | xhigh | max`). Omitted, the server runs its
   * configured default; the server still clamps any value to what the
   * resolved model declares and the caller's audience may spend.
   */
  effort?: ReasoningEffort;
}

export type AuthRefreshHandler = () => Promise<RefreshOutcome>;

/**
 * The turn leg the client replays — the opening message, or the decision that
 * resumes a turn suspended on a proposal.
 */
type DecisionRequest =
  | { kind: 'approve'; proposalId: string }
  | { kind: 'reject'; proposalId: string; reason?: string };

type PendingRequest =
  | { kind: 'message'; content: string; turnId: string }
  | DecisionRequest;

const AUTH_REQUIRED_CODE = 'AUTH_REQUIRED';
const AUTH_ERROR: AgentErrorPayload = {
  code: AUTH_REQUIRED_CODE,
  message: 'Authentication required',
};
const CONNECTION_ERROR: AgentErrorPayload = {
  code: 'CONNECTION_FAILED',
  message: 'Failed to connect to agent server',
};
/**
 * socket.io delivers at most once: an event written to a transport that has
 * already died is lost, and nothing replays it after the reconnect. Every
 * request therefore waits for the server's receipt, and one that never comes
 * ends the request instead of leaving the turn open forever. It is not resent
 * on its own: a proposal decision carries no turn id for the server to
 * deduplicate, so a copy reaching it after a reconnect would count as a second
 * decision. The deadline runs from the emit, so it also caps how long a
 * request may wait for the socket to connect.
 */
const AGENT_ACK_TIMEOUT_MS = 10_000;
const TURN_RESEND_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const RESENDABLE_TURN_ERROR_CODES: ReadonlySet<string> = new Set([
  AGENT_TURN_ERROR_CODE.TURN_IN_PROGRESS,
  AGENT_TURN_ERROR_CODE.TURN_CLAIM_UNAVAILABLE,
]);

export class AgentClient {
  private socket: Socket | null = null;
  private activeCallbacks: AgentStreamCallbacks | null = null;
  private activeTurnId: string | undefined;
  private pending: PendingRequest | null = null;
  private awaitingReceipt: PendingRequest | null = null;
  private awaitingDecision = false;
  private pendingNoteId: string | undefined;
  private pendingEffort: ReasoningEffort | undefined;
  private conversationId: string | undefined;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private turnResends = 0;
  private turnResendTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly wsUrl: string | undefined;
  private readonly authPolicy: TokenRefreshPolicy = createTokenRefreshPolicy();
  private tokenProvider: TokenProvider = {
    getAccessToken: () => null,
    clearTokens: () => {},
  };
  private authRefreshHandler: AuthRefreshHandler | null = null;
  private onSessionExpired: (() => void) | null = null;
  private recoveringAuth = false;

  constructor(wsUrl?: string) {
    this.wsUrl = wsUrl;
  }

  setTokenProvider(provider: TokenProvider): void {
    this.tokenProvider = provider;
  }

  setAuthRefreshHandler(handler: AuthRefreshHandler | null): void {
    this.authRefreshHandler = handler;
  }

  setSessionExpiredHandler(handler: (() => void) | null): void {
    this.onSessionExpired = handler;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  disconnect(): void {
    this.clearPending();
    this.teardownSocket();
  }

  sendMessage(
    content: string,
    callbacks: AgentStreamCallbacks,
    noteId?: string,
    options?: AgentSendOptions
  ): AgentStreamHandle {
    if (this.activeCallbacks) {
      this.abandonPending();
    }

    const turnId = crypto.randomUUID();
    this.activeCallbacks = callbacks;
    this.activeTurnId = turnId;
    this.pendingNoteId = noteId;
    this.pendingEffort = options?.effort;

    this.dispatch({ kind: 'message', content, turnId }, callbacks);

    return {
      turnId,
      cancel: () => {
        if (this.activeCallbacks === callbacks) {
          this.abandonPending();
        }
      },
    };
  }

  private beginAuthRecovery(): void {
    this.recoveringAuth = true;
    void this.authPolicy.recover(this.authHandlers());
  }

  /**
   * Resolves the request to resume from the live pending state rather than a
   * captured one: a send issued while the refresh is in flight is suppressed by
   * the policy's in-flight guard, so it is this recovery that must carry it.
   */
  private authHandlers(): Parameters<TokenRefreshPolicy['recover']>[0] {
    const pending = () => {
      const callbacks = this.activeCallbacks;
      const request = this.pending;
      return callbacks && request ? { callbacks, request } : null;
    };
    return {
      refresh: () => this.authRefreshHandler?.() ?? Promise.resolve('rejected'),
      onRefreshed: () => {
        this.recoveringAuth = false;
        const pendingRequest = pending();
        if (!pendingRequest) {
          return;
        }
        this.teardownSocket();
        this.emitPending(pendingRequest.request, pendingRequest.callbacks);
      },
      onUnavailable: () => {
        this.recoveringAuth = false;
        const pendingRequest = pending();
        if (pendingRequest) {
          this.failRequest(pendingRequest.callbacks, CONNECTION_ERROR);
        }
      },
      onExhausted: () => {
        this.recoveringAuth = false;
        // A turn awaiting a decision has no pending request, and a dead
        // credential still ends its session: fall back to its callbacks so the
        // dock stops waiting on a decision the server will never accept.
        const callbacks = pending()?.callbacks ?? this.activeCallbacks;
        if (!callbacks) {
          return;
        }
        this.failRequest(callbacks, AUTH_ERROR);
        this.onSessionExpired?.();
      },
      onError: (error) =>
        logger.warn('Agent auth refresh threw', {
          error,
          context: 'AgentClient',
        }),
    };
  }

  private dispatch(
    request: PendingRequest,
    callbacks: AgentStreamCallbacks
  ): void {
    this.pending = request;
    this.awaitingDecision = false;
    this.reconnectAttempts = 0;
    this.turnResends = 0;
    this.cancelTurnResend();
    this.authPolicy.reset();

    if (this.tokenProvider.getAccessToken()) {
      this.emitPending(request, callbacks);
    } else if (this.authRefreshHandler) {
      this.beginAuthRecovery();
    } else {
      this.failRequest(callbacks, AUTH_ERROR);
    }
  }

  private emitPending(
    request: PendingRequest,
    callbacks: AgentStreamCallbacks
  ): void {
    this.ensureSocket();
    const socket = this.socket;
    if (!socket) {
      this.failRequest(callbacks, CONNECTION_ERROR);
      return;
    }
    const noteId = this.pendingNoteId ? { noteId: this.pendingNoteId } : {};
    this.awaitingReceipt = request;
    const receipt = this.deliveryReceipt(socket, request, callbacks);
    switch (request.kind) {
      case 'message':
        socket.emit(
          'agent:message',
          {
            turnId: request.turnId,
            ...(this.conversationId
              ? { conversationId: this.conversationId }
              : {}),
            message: { content: request.content },
            ...noteId,
            ...(this.pendingEffort ? { effort: this.pendingEffort } : {}),
          },
          receipt
        );
        return;
      case 'approve':
        socket.emit(
          'agent:approve',
          { proposalId: request.proposalId, ...noteId },
          receipt
        );
        return;
      case 'reject':
        socket.emit(
          'agent:reject',
          {
            proposalId: request.proposalId,
            ...noteId,
            ...(request.reason ? { reason: request.reason } : {}),
          },
          receipt
        );
        return;
      default: {
        const exhaustive: never = request;
        throw new Error(`Unhandled pending request: ${String(exhaustive)}`);
      }
    }
  }

  private deliveryReceipt(
    socket: Socket,
    request: PendingRequest,
    callbacks: AgentStreamCallbacks
  ): (error: Error | null) => void {
    return (error) => {
      if (
        this.socket !== socket ||
        this.pending !== request ||
        this.activeCallbacks !== callbacks
      ) {
        return;
      }
      if (!error) {
        this.awaitingReceipt = null;
        return;
      }
      this.teardownSocket();
      this.failRequest(callbacks, CONNECTION_ERROR);
    };
  }

  /** Every cancel drops the socket, acknowledged or not: the server aborts the
   * turn on disconnect regardless, and a socket kept alive would let the next
   * turn reuse it and adopt this one's late events. An acknowledged turn still
   * emits agent:cancel first — engine.io defers the actual close until it
   * drains, so the emit still reaches the server before the socket dies. */
  private abandonPending(): void {
    if (!(this.pending && this.pending === this.awaitingReceipt)) {
      this.socket?.emit('agent:cancel');
    }
    this.clearPending();
    this.teardownSocket();
  }

  private clearPending(): void {
    this.activeCallbacks = null;
    this.activeTurnId = undefined;
    this.pending = null;
    this.awaitingReceipt = null;
    this.awaitingDecision = false;
    this.cancelTurnResend();
  }

  private scheduleTurnResend(
    error: AgentErrorPayload,
    callbacks: AgentStreamCallbacks
  ): boolean {
    const request = this.pending;
    const delay = TURN_RESEND_DELAYS_MS[this.turnResends];
    if (
      request?.kind !== 'message' ||
      !RESENDABLE_TURN_ERROR_CODES.has(error.code) ||
      delay === undefined
    ) {
      return false;
    }
    this.turnResends++;
    this.turnResendTimer = setTimeout(() => {
      this.turnResendTimer = undefined;
      this.emitPending(request, callbacks);
    }, delay);
    return true;
  }

  private cancelTurnResend(): void {
    clearTimeout(this.turnResendTimer);
    this.turnResendTimer = undefined;
  }

  private failRequest(
    callbacks: AgentStreamCallbacks,
    error: AgentErrorPayload
  ): void {
    callbacks.onError(error);
    if (this.activeCallbacks === callbacks) {
      this.clearPending();
    }
  }

  private getWsUrl(): string {
    if (this.wsUrl) {
      return this.wsUrl;
    }

    const apiUrl = import.meta.env?.['VITE_API_URL'];
    const baseUrl =
      import.meta.env?.['VITE_WS_URL'] ||
      (apiUrl && deriveWsBaseUrl(apiUrl)) ||
      'http://localhost:3333';

    return `${baseUrl}/agent`;
  }

  private ensureSocket(): void {
    if (this.socket?.connected || this.socket?.active) {
      return;
    }

    this.teardownSocket();
    this.socket = io(this.getWsUrl(), {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      withCredentials: true,
      auth: (cb) => cb({ token: this.tokenProvider.getAccessToken() ?? '' }),
      ackTimeout: AGENT_ACK_TIMEOUT_MS,
    });

    this.setupEventListeners(this.socket);
  }

  /** Detaches the socket before closing it, so its `disconnect` event is recognisable as ours. */
  private teardownSocket(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.disconnect();
  }

  private setupEventListeners(socket: Socket): void {
    socket.on('connect', () => {
      this.reconnectAttempts = 0;
      logger.info('Agent WebSocket connected', { context: 'AgentClient' });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Agent WebSocket disconnected: ${reason}`, {
        context: 'AgentClient',
      });
      // A replaced socket was torn down on purpose and an active one is still
      // reconnecting, so neither may fail the turn.
      if (this.socket !== socket || socket.active) {
        return;
      }
      // A server-forced close never reconnects, so a later emit would sit in
      // the send buffer. A turn suspended on a proposal has nothing in flight
      // to fail — its decision opens a fresh socket instead.
      const callbacks = this.activeCallbacks;
      this.teardownSocket();
      if (callbacks && !this.recoveringAuth && !this.awaitingDecision) {
        this.failRequest(callbacks, CONNECTION_ERROR);
      }
    });

    socket.on('connect_error', (error) => {
      logger.error('Agent connection error', { error, context: 'AgentClient' });
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (this.activeCallbacks) {
          this.failRequest(this.activeCallbacks, CONNECTION_ERROR);
        }
        this.teardownSocket();
      }
    });

    // A socket the client has already replaced can still deliver buffered
    // events, and every handler below reads or writes the LIVE turn's state —
    // so each one runs only while its own socket is still the current one.
    const onCurrentSocket = <T extends { turnId?: string }>(
      event: string,
      handle: (payload: T) => void
    ) => {
      socket.on(event, (payload: T) => {
        if (this.socket !== socket || this.isForeignTurn(payload)) {
          return;
        }
        handle(payload);
      });
    };

    onCurrentSocket('agent:chunk', (payload: AgentChunkPayload) => {
      this.activeCallbacks?.onChunk(payload);
    });

    onCurrentSocket('agent:thinking', (payload: AgentThinkingPayload) => {
      this.activeCallbacks?.onThinking?.(payload);
    });

    onCurrentSocket(
      'agent:conversation',
      (payload: AgentConversationPayload) => {
        // A late announcement after cancel + new conversation would re-attach the old thread.
        const callbacks = this.activeCallbacks;
        if (callbacks) {
          this.conversationId = payload.conversationId;
          callbacks.onConversation?.(payload.conversationId);
        }
      }
    );

    onCurrentSocket('agent:done', (payload: AgentDonePayload) => {
      const callbacks = this.activeCallbacks;
      if (callbacks && payload.conversationId) {
        this.conversationId = payload.conversationId;
        callbacks.onConversation?.(payload.conversationId);
      }
      this.clearPending();
      callbacks?.onDone(payload);
    });

    onCurrentSocket('agent:proposal', (payload: AgentProposalPayload) => {
      this.pending = null;
      this.awaitingReceipt = null;
      this.awaitingDecision = true;
      this.activeCallbacks?.onProposal?.(payload);
    });

    onCurrentSocket('agent:committed', (payload: AgentCommittedPayload) => {
      this.activeCallbacks?.onCommitted?.(payload);
    });

    onCurrentSocket(
      'agent:turn_settled',
      (payload: AgentTurnSettledPayload) => {
        const callbacks = this.activeCallbacks;
        if (!callbacks) {
          return;
        }
        this.conversationId = payload.conversationId;
        callbacks.onConversation?.(payload.conversationId);
        this.clearPending();
        callbacks.onTurnSettled?.(payload);
      }
    );

    onCurrentSocket('agent:error', (payload: AgentErrorPayload) => {
      const callbacks = this.activeCallbacks;
      if (!callbacks) {
        return;
      }
      // A turn suspended on a proposal has no request in flight, but its
      // decision still needs a live token: `getAccessToken` keeps returning the
      // expired one, so without refreshing here the decision would emit with
      // the very token the server just rejected.
      if (this.canRecoverFromAuthError(payload)) {
        this.beginAuthRecovery();
        return;
      }
      if (this.scheduleTurnResend(payload, callbacks)) {
        return;
      }
      this.failRequest(callbacks, payload);
    });
  }

  private isForeignTurn(payload: { turnId?: string }): boolean {
    return payload.turnId !== undefined && payload.turnId !== this.activeTurnId;
  }

  /**
   * True while a turn is still open on this client, so a proposal decision has
   * somewhere to stream back to. False means the turn ended (done, cancelled or
   * superseded) — only the server can say whether the proposal itself expired.
   */
  canResume(): boolean {
    return this.activeCallbacks !== null;
  }

  /** No-op when the turn already ended; reopens the socket when the server closed it. */
  approve(proposalId: string): void {
    this.resume({ kind: 'approve', proposalId });
  }

  /** No-op when the turn already ended; reopens the socket when the server closed it. */
  reject(proposalId: string, reason?: string): void {
    this.resume({
      kind: 'reject',
      proposalId,
      ...(reason ? { reason } : {}),
    });
  }

  private resume(request: DecisionRequest): void {
    const callbacks = this.activeCallbacks;
    if (!callbacks) {
      return;
    }
    this.dispatch(request, callbacks);
  }

  /** Starts a fresh server conversation on the next send. */
  resetConversation(): void {
    this.conversationId = undefined;
  }

  resumeConversation(conversationId: string): void {
    this.conversationId = conversationId;
  }

  private canRecoverFromAuthError(payload: AgentErrorPayload): boolean {
    return payload.code === AUTH_REQUIRED_CODE && !!this.authRefreshHandler;
  }
}

export const agentClient = new AgentClient();
