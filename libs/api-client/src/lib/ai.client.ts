import { io, type Socket } from 'socket.io-client';

import type { AIAction } from '@knowtis/shared-types';
import { logger } from '@knowtis/shared-util';

import type { TokenProvider } from './http-client';

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

const NOOP_HANDLE: AIStreamHandle = { cancel: () => {} };

class AIClient {
  private socket: Socket | null = null;
  private activeCallbacks: AIStreamCallbacks | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly wsUrl: string | undefined;
  private tokenProvider: TokenProvider = {
    getAccessToken: () => null,
    clearTokens: () => {},
  };

  constructor(wsUrl?: string) {
    this.wsUrl = wsUrl;
  }

  setTokenProvider(provider: TokenProvider): void {
    this.tokenProvider = provider;
  }

  private getWsUrl(): string {
    if (this.wsUrl) {
      return this.wsUrl;
    }

    const baseUrl =
      import.meta.env?.['VITE_WS_URL'] ||
      import.meta.env?.['VITE_API_URL']?.replace('/api', '') ||
      'http://localhost:3333';

    return `${baseUrl}/ai`;
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const token = this.tokenProvider.getAccessToken();

    if (!token) {
      logger.warn('No access token available for AI connection', {
        context: 'AIClient',
      });
      return;
    }

    this.socket = io(this.getWsUrl(), {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      withCredentials: true,
      auth: { token },
    });

    this.setupEventListeners();
  }

  disconnect(): void {
    this.activeCallbacks = null;
    this.socket?.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  stream(
    payload: AICompletePayload,
    callbacks: AIStreamCallbacks
  ): AIStreamHandle {
    if (this.activeCallbacks) {
      this.socket?.emit('ai:cancel');
      this.activeCallbacks = null;
    }

    if (!this.isConnected()) {
      this.connect();
    }

    if (!this.socket) {
      callbacks.onError({
        code: 'CONNECTION_FAILED',
        message: 'Failed to connect to AI server',
      });
      return NOOP_HANDLE;
    }

    this.activeCallbacks = callbacks;
    this.socket.emit('ai:complete', payload);

    return {
      cancel: () => {
        if (this.activeCallbacks === callbacks) {
          this.socket?.emit('ai:cancel');
          this.activeCallbacks = null;
        }
      },
    };
  }

  private setupEventListeners(): void {
    if (!this.socket) {
      return;
    }

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      logger.info('AI WebSocket connected', { context: 'AIClient' });
    });

    this.socket.on('disconnect', (reason) => {
      logger.info(`AI WebSocket disconnected: ${reason}`, {
        context: 'AIClient',
      });
      this.activeCallbacks = null;
    });

    this.socket.on('connect_error', (error) => {
      logger.error('AI connection error', { error, context: 'AIClient' });
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.activeCallbacks?.onError({
          code: 'CONNECTION_FAILED',
          message: 'Failed to connect to AI server',
        });
        this.activeCallbacks = null;
      }
    });

    this.socket.on('ai:chunk', (payload: AIChunkPayload) => {
      this.activeCallbacks?.onChunk(payload);
    });

    this.socket.on('ai:done', (payload: AIDonePayload) => {
      this.activeCallbacks?.onDone(payload);
      this.activeCallbacks = null;
    });

    this.socket.on('ai:error', (payload: AIErrorPayload) => {
      this.activeCallbacks?.onError(payload);
      this.activeCallbacks = null;
    });
  }
}

export const aiClient = new AIClient();
