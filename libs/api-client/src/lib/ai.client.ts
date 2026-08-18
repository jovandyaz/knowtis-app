import { io, type Socket } from 'socket.io-client';

import type { AIAction } from '@knowtis/shared-types';
import { logger } from '@knowtis/shared-util';

import type { TokenProvider } from './http-client';
import {
  createTokenRefreshPolicy,
  type RefreshOutcome,
  type TokenRefreshPolicy,
} from './token-refresh-policy';
import { deriveWsBaseUrl } from './ws-url';

export interface AICompletePayload {
  action: AIAction;
  content: string;
  selection?: string;
  suffix?: string;
  targetLanguage?: string;
  targetTone?: string;
}

export interface AIChunkPayload {
  text: string;
}

interface AIUsagePayload {
  inputTokens: number;
  outputTokens: number;
  model: string;
  costUsd: number;
}

export interface AIDonePayload {
  usage: AIUsagePayload;
}

export interface AIErrorPayload {
  code: string;
  message: string;
}

interface AIStreamCallbacks {
  onChunk: (payload: AIChunkPayload) => void;
  onDone: (payload: AIDonePayload) => void;
  onError: (payload: AIErrorPayload) => void;
}

export interface AIStreamHandle {
  cancel: () => void;
}

/** Resolves `refreshed` only when the new token is observable via the wired `TokenProvider`. */
export type AuthRefreshHandler = () => Promise<RefreshOutcome>;

const AUTH_REQUIRED_CODE = 'AUTH_REQUIRED';
const AUTH_ERROR: AIErrorPayload = {
  code: AUTH_REQUIRED_CODE,
  message: 'Authentication required',
};
const CONNECTION_ERROR: AIErrorPayload = {
  code: 'CONNECTION_FAILED',
  message: 'Failed to connect to AI server',
};

export class AIClient {
  private socket: Socket | null = null;
  private activeCallbacks: AIStreamCallbacks | null = null;
  private pendingPayload: AICompletePayload | null = null;
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
    this.activeCallbacks = null;
    this.pendingPayload = null;
    this.teardownSocket();
  }

  stream(
    payload: AICompletePayload,
    callbacks: AIStreamCallbacks
  ): AIStreamHandle {
    if (this.activeCallbacks) {
      this.socket?.emit('ai:cancel');
      this.activeCallbacks = null;
    }

    this.activeCallbacks = callbacks;
    this.pendingPayload = payload;
    this.authPolicy.reset();

    if (this.tokenProvider.getAccessToken()) {
      this.openAndEmit(payload, callbacks);
    } else if (this.authRefreshHandler) {
      this.beginAuthRecovery();
    } else {
      this.failRequest(callbacks, AUTH_ERROR);
    }

    return {
      cancel: () => {
        if (this.activeCallbacks === callbacks) {
          this.socket?.emit('ai:cancel');
          this.activeCallbacks = null;
          this.pendingPayload = null;
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
   * captured one: a request issued while the refresh is in flight is suppressed
   * by the policy's in-flight guard, so it is this recovery that must carry it.
   */
  private authHandlers(): Parameters<TokenRefreshPolicy['recover']>[0] {
    const pending = () => {
      const callbacks = this.activeCallbacks;
      const payload = this.pendingPayload;
      return callbacks && payload ? { callbacks, payload } : null;
    };
    return {
      refresh: () => this.authRefreshHandler?.() ?? Promise.resolve('rejected'),
      onRefreshed: () => {
        this.recoveringAuth = false;
        const request = pending();
        if (!request) {
          return;
        }
        this.teardownSocket();
        this.openAndEmit(request.payload, request.callbacks);
      },
      onUnavailable: () => {
        this.recoveringAuth = false;
        const request = pending();
        if (request) {
          this.failRequest(request.callbacks, CONNECTION_ERROR);
        }
      },
      onExhausted: () => {
        this.recoveringAuth = false;
        const request = pending();
        if (!request) {
          return;
        }
        this.failRequest(request.callbacks, AUTH_ERROR);
        this.onSessionExpired?.();
      },
      onError: (error) =>
        logger.warn('AI auth refresh threw', { error, context: 'AIClient' }),
    };
  }

  private openAndEmit(
    payload: AICompletePayload,
    callbacks: AIStreamCallbacks
  ): void {
    this.ensureSocket();
    if (!this.socket) {
      this.failRequest(callbacks, CONNECTION_ERROR);
      return;
    }
    this.socket.emit('ai:complete', payload);
  }

  private failRequest(
    callbacks: AIStreamCallbacks,
    error: AIErrorPayload
  ): void {
    callbacks.onError(error);
    if (this.activeCallbacks === callbacks) {
      this.activeCallbacks = null;
      this.pendingPayload = null;
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

    return `${baseUrl}/ai`;
  }

  /** Reads the latest token via the auth function so reconnects pick up fresh credentials. */
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
      logger.info('AI WebSocket connected', { context: 'AIClient' });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`AI WebSocket disconnected: ${reason}`, {
        context: 'AIClient',
      });
      // Our own teardown already decided what happens to the request.
      if (this.socket !== socket || socket.active) {
        return;
      }
      // A server-forced close never reconnects on its own, so anything emitted
      // afterwards would sit in the send buffer with nothing to flush it.
      const callbacks = this.activeCallbacks;
      this.teardownSocket();
      if (callbacks && !this.recoveringAuth) {
        this.failRequest(callbacks, CONNECTION_ERROR);
      }
    });

    socket.on('connect_error', (error) => {
      logger.error('AI connection error', { error, context: 'AIClient' });
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (this.activeCallbacks) {
          this.failRequest(this.activeCallbacks, CONNECTION_ERROR);
        }
        this.teardownSocket();
      }
    });

    socket.on('ai:chunk', (payload: AIChunkPayload) => {
      this.activeCallbacks?.onChunk(payload);
    });

    socket.on('ai:done', (payload: AIDonePayload) => {
      this.activeCallbacks?.onDone(payload);
      this.activeCallbacks = null;
      this.pendingPayload = null;
    });

    socket.on('ai:error', (payload: AIErrorPayload) => {
      if (
        this.pendingPayload &&
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

  private canRecoverFromAuthError(payload: AIErrorPayload): boolean {
    return payload.code === AUTH_REQUIRED_CODE && !!this.authRefreshHandler;
  }
}

export const aiClient = new AIClient();
