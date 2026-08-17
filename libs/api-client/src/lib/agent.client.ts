import { io, type Socket } from 'socket.io-client';

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
  text: string;
}

export interface AgentThinkingPayload {
  text: string;
}

interface AgentUsagePayload {
  inputTokens: number;
  outputTokens: number;
  model: string;
  costUsd: number;
}

export interface AgentDonePayload {
  usage: AgentUsagePayload;
  sources: AgentSource[];
  knownNotes: AgentSource[];
  webSources: WebSource[];
  conversationId?: string;
}

export interface AgentErrorPayload {
  code: string;
  message: string;
}

export interface AgentProposalPayload {
  id: string;
  kind: 'create' | 'update' | 'share';
  targetNoteId: string | null;
  summary: string;
  previewHtml: string | null;
  payload: Record<string, unknown>;
}

export interface AgentCommittedPayload {
  proposalId: string;
  result: {
    noteId: string;
    title: string;
    kind: 'create' | 'update' | 'share';
  };
}

interface AgentStreamCallbacks {
  onChunk: (payload: AgentChunkPayload) => void;
  onThinking?: (payload: AgentThinkingPayload) => void;
  onDone: (payload: AgentDonePayload) => void;
  onError: (payload: AgentErrorPayload) => void;
  onProposal?: (payload: AgentProposalPayload) => void;
  onCommitted?: (payload: AgentCommittedPayload) => void;
}

export interface AgentStreamHandle {
  cancel: () => void;
}

export type AuthRefreshHandler = () => Promise<RefreshOutcome>;

/**
 * The turn leg the client replays when it has to open a fresh socket — the
 * opening message, or the decision that resumes a turn suspended on a proposal.
 */
type DecisionRequest =
  | { kind: 'approve'; proposalId: string }
  | { kind: 'reject'; proposalId: string; reason?: string };

type PendingRequest = { kind: 'message'; content: string } | DecisionRequest;

const AUTH_REQUIRED_CODE = 'AUTH_REQUIRED';
const AUTH_ERROR: AgentErrorPayload = {
  code: AUTH_REQUIRED_CODE,
  message: 'Authentication required',
};
const CONNECTION_ERROR: AgentErrorPayload = {
  code: 'CONNECTION_FAILED',
  message: 'Failed to connect to agent server',
};

export class AgentClient {
  private socket: Socket | null = null;
  private activeCallbacks: AgentStreamCallbacks | null = null;
  private pending: PendingRequest | null = null;
  private awaitingDecision = false;
  private pendingNoteId: string | undefined;
  private conversationId: string | undefined;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
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
    noteId?: string
  ): AgentStreamHandle {
    if (this.activeCallbacks) {
      this.socket?.emit('agent:cancel');
      this.clearPending();
    }

    this.activeCallbacks = callbacks;
    this.pendingNoteId = noteId;

    this.dispatch({ kind: 'message', content }, callbacks);

    return {
      cancel: () => {
        if (this.activeCallbacks === callbacks) {
          this.socket?.emit('agent:cancel');
          this.clearPending();
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
        const pendingRequest = pending();
        if (!pendingRequest) {
          return;
        }
        this.failRequest(pendingRequest.callbacks, AUTH_ERROR);
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
    if (!this.socket) {
      this.failRequest(callbacks, CONNECTION_ERROR);
      return;
    }
    const noteId = this.pendingNoteId ? { noteId: this.pendingNoteId } : {};
    switch (request.kind) {
      case 'message':
        this.socket.emit('agent:message', {
          ...(this.conversationId
            ? { conversationId: this.conversationId }
            : {}),
          message: { content: request.content },
          ...noteId,
        });
        return;
      case 'approve':
        this.socket.emit('agent:approve', {
          proposalId: request.proposalId,
          ...noteId,
        });
        return;
      case 'reject':
        this.socket.emit('agent:reject', {
          proposalId: request.proposalId,
          ...noteId,
          ...(request.reason ? { reason: request.reason } : {}),
        });
        return;
      default: {
        const exhaustive: never = request;
        throw new Error(`Unhandled pending request: ${String(exhaustive)}`);
      }
    }
  }

  private clearPending(): void {
    this.activeCallbacks = null;
    this.pending = null;
    this.awaitingDecision = false;
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
    });

    this.setupEventListeners();
  }

  /** Detaches the socket before closing it, so its `disconnect` event is recognisable as ours. */
  private teardownSocket(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.disconnect();
  }

  private setupEventListeners(): void {
    const socket = this.socket;
    if (!socket) {
      return;
    }

    socket.on('connect', () => {
      this.reconnectAttempts = 0;
      logger.info('Agent WebSocket connected', { context: 'AgentClient' });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Agent WebSocket disconnected: ${reason}`, {
        context: 'AgentClient',
      });
      // Our own teardown already decided what happens to the request.
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

    socket.on('agent:chunk', (payload: AgentChunkPayload) => {
      this.activeCallbacks?.onChunk(payload);
    });

    socket.on('agent:thinking', (payload: AgentThinkingPayload) => {
      this.activeCallbacks?.onThinking?.(payload);
    });

    socket.on('agent:done', (payload: AgentDonePayload) => {
      if (payload.conversationId) {
        this.conversationId = payload.conversationId;
      }
      this.activeCallbacks?.onDone(payload);
      this.clearPending();
    });

    socket.on('agent:proposal', (payload: AgentProposalPayload) => {
      this.awaitingDecision = true;
      this.activeCallbacks?.onProposal?.(payload);
    });

    socket.on('agent:committed', (payload: AgentCommittedPayload) => {
      this.activeCallbacks?.onCommitted?.(payload);
    });

    socket.on('agent:error', (payload: AgentErrorPayload) => {
      if (
        this.pending &&
        this.activeCallbacks &&
        this.canRecoverFromAuthError(payload)
      ) {
        this.beginAuthRecovery();
        return;
      }

      if (this.activeCallbacks) {
        this.failRequest(this.activeCallbacks, payload);
      }
    });
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

  private canRecoverFromAuthError(payload: AgentErrorPayload): boolean {
    return payload.code === AUTH_REQUIRED_CODE && !!this.authRefreshHandler;
  }
}

export const agentClient = new AgentClient();
