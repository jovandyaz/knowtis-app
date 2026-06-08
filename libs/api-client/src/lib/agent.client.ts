import { io, type Socket } from 'socket.io-client';

import { logger } from '@knowtis/shared-util';

import type { TokenProvider } from './http-client';
import {
  createTokenRefreshPolicy,
  type TokenRefreshPolicy,
} from './token-refresh-policy';

export interface AgentWireMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentSource {
  id: string;
  title: string;
}

export interface AgentChunkPayload {
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
}

export interface AgentErrorPayload {
  code: string;
  message: string;
}

interface AgentStreamCallbacks {
  onChunk: (payload: AgentChunkPayload) => void;
  onDone: (payload: AgentDonePayload) => void;
  onError: (payload: AgentErrorPayload) => void;
}

export interface AgentStreamHandle {
  cancel: () => void;
}

export type AuthRefreshHandler = () => Promise<boolean>;

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
  private pendingMessages: AgentWireMessage[] | null = null;
  private pendingNoteId: string | undefined;
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
    this.pendingMessages = null;
    this.teardownSocket();
  }

  sendMessage(
    messages: AgentWireMessage[],
    callbacks: AgentStreamCallbacks,
    noteId?: string
  ): AgentStreamHandle {
    if (this.activeCallbacks) {
      this.socket?.emit('agent:cancel');
      this.activeCallbacks = null;
    }

    this.activeCallbacks = callbacks;
    this.pendingMessages = messages;
    this.pendingNoteId = noteId;
    this.authPolicy.reset();

    if (this.tokenProvider.getAccessToken()) {
      this.openAndEmit(messages, callbacks);
    } else if (this.authRefreshHandler) {
      void this.authPolicy.recover(this.authHandlers(messages, callbacks));
    } else {
      this.failRequest(callbacks, AUTH_ERROR);
    }

    return {
      cancel: () => {
        if (this.activeCallbacks === callbacks) {
          this.socket?.emit('agent:cancel');
          this.activeCallbacks = null;
          this.pendingMessages = null;
        }
      },
    };
  }

  private authHandlers(
    messages: AgentWireMessage[],
    callbacks: AgentStreamCallbacks
  ): Parameters<TokenRefreshPolicy['recover']>[0] {
    return {
      refresh: () => this.authRefreshHandler?.() ?? Promise.resolve(false),
      onRefreshed: () => {
        if (this.activeCallbacks !== callbacks) {
          return;
        }
        this.teardownSocket();
        this.openAndEmit(messages, callbacks);
      },
      onExhausted: () => {
        if (this.activeCallbacks !== callbacks) {
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

  private openAndEmit(
    messages: AgentWireMessage[],
    callbacks: AgentStreamCallbacks
  ): void {
    this.ensureSocket();
    if (!this.socket) {
      this.failRequest(callbacks, CONNECTION_ERROR);
      return;
    }
    this.socket.emit('agent:message', {
      messages,
      ...(this.pendingNoteId ? { noteId: this.pendingNoteId } : {}),
    });
  }

  private failRequest(
    callbacks: AgentStreamCallbacks,
    error: AgentErrorPayload
  ): void {
    callbacks.onError(error);
    if (this.activeCallbacks === callbacks) {
      this.activeCallbacks = null;
      this.pendingMessages = null;
    }
  }

  private getWsUrl(): string {
    if (this.wsUrl) {
      return this.wsUrl;
    }

    const baseUrl =
      import.meta.env?.['VITE_WS_URL'] ||
      import.meta.env?.['VITE_API_URL']?.replace('/api', '') ||
      'http://localhost:3333';

    return `${baseUrl}/agent`;
  }

  private ensureSocket(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(this.getWsUrl(), {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      withCredentials: true,
      auth: (cb) => cb({ token: this.tokenProvider.getAccessToken() ?? '' }),
    });

    this.setupEventListeners();
  }

  private teardownSocket(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  private setupEventListeners(): void {
    if (!this.socket) {
      return;
    }

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      logger.info('Agent WebSocket connected', { context: 'AgentClient' });
    });

    this.socket.on('disconnect', (reason) => {
      logger.info(`Agent WebSocket disconnected: ${reason}`, {
        context: 'AgentClient',
      });
    });

    this.socket.on('connect_error', (error) => {
      logger.error('Agent connection error', { error, context: 'AgentClient' });
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (this.activeCallbacks) {
          this.failRequest(this.activeCallbacks, CONNECTION_ERROR);
        }
      }
    });

    this.socket.on('agent:chunk', (payload: AgentChunkPayload) => {
      this.activeCallbacks?.onChunk(payload);
    });

    this.socket.on('agent:done', (payload: AgentDonePayload) => {
      this.activeCallbacks?.onDone(payload);
      this.activeCallbacks = null;
      this.pendingMessages = null;
    });

    this.socket.on('agent:error', (payload: AgentErrorPayload) => {
      if (this.canRecoverFromAuthError(payload)) {
        void this.authPolicy.recover(
          this.authHandlers(this.pendingMessages!, this.activeCallbacks!)
        );
        return;
      }

      if (this.activeCallbacks) {
        this.failRequest(this.activeCallbacks, payload);
      }
    });
  }

  private canRecoverFromAuthError(payload: AgentErrorPayload): boolean {
    return (
      payload.code === AUTH_REQUIRED_CODE &&
      !!this.authRefreshHandler &&
      !!this.activeCallbacks &&
      !!this.pendingMessages
    );
  }
}

export const agentClient = new AgentClient();
