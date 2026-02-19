import { io, type Socket } from 'socket.io-client';

import {
  COLLABORATION_EVENTS,
  type AwarenessUpdatePayload,
  type CollaborationError,
  type CollaborationUser,
  type InitialStateResponse,
  type JoinRoomPayload,
  type SyncUpdatePayload,
  type UserJoinedPayload,
  type UserLeftPayload,
} from '@knowtis/shared-types';
import { logger } from '@knowtis/shared-util';

import type { TokenProvider } from './http-client';

interface CollaborationEventHandlers {
  onInitialState?: (response: InitialStateResponse) => void;
  onDocumentUpdate?: (payload: SyncUpdatePayload) => void;
  onUserJoined?: (user: UserJoinedPayload) => void;
  onUserLeft?: (payload: UserLeftPayload) => void;
  onAwarenessChange?: (payload: AwarenessUpdatePayload) => void;
  onEditDenied?: (error: CollaborationError) => void;
  onError?: (error: CollaborationError) => void;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
}

export interface CollaborationConnectOptions {
  shareToken?: string | undefined;
}

export class CollaborationClient {
  private socket: Socket | null = null;
  private handlers: CollaborationEventHandlers = {};
  private currentNoteId: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly wsUrl: string | undefined;
  private shareToken: string | undefined;
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

    return `${baseUrl}/collaboration`;
  }

  setHandlers(handlers: CollaborationEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect(options?: CollaborationConnectOptions): void {
    if (this.socket?.connected) {
      return;
    }

    this.shareToken = options?.shareToken;
    const token = this.tokenProvider.getAccessToken();

    this.socket = io(this.getWsUrl(), {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      auth: {
        userId: token ? undefined : `anon-${Date.now()}`,
        shareToken: this.shareToken,
      },
      ...(token ? { extraHeaders: { Authorization: `Bearer ${token}` } } : {}),
    });

    this.setupEventListeners();
  }

  disconnect(): void {
    if (this.currentNoteId) {
      this.leaveRoom();
    }
    this.socket?.disconnect();
    this.socket = null;
  }

  joinRoom(noteId: string, user: Omit<CollaborationUser, 'id'>): void {
    if (!this.socket?.connected) {
      logger.warn('Not connected to collaboration server', {
        context: 'CollaborationClient',
      });
      return;
    }

    if (this.currentNoteId && this.currentNoteId !== noteId) {
      this.leaveRoom();
    }

    const payload: JoinRoomPayload = { noteId, user };
    this.socket.emit(COLLABORATION_EVENTS.JOIN_ROOM, payload);
    this.currentNoteId = noteId;
  }

  leaveRoom(): void {
    if (!this.socket?.connected || !this.currentNoteId) {
      return;
    }

    this.socket.emit(COLLABORATION_EVENTS.LEAVE_ROOM);
    this.currentNoteId = null;
  }

  sendUpdate(update: Uint8Array): void {
    if (!this.socket?.connected || !this.currentNoteId) {
      return;
    }

    const payload: SyncUpdatePayload = {
      noteId: this.currentNoteId,
      update: Array.from(update),
    };

    this.socket.emit(COLLABORATION_EVENTS.SYNC_UPDATE, payload);
  }

  sendAwarenessUpdate(update: Uint8Array): void {
    if (!this.socket?.connected || !this.currentNoteId) {
      return;
    }

    const payload: AwarenessUpdatePayload = {
      noteId: this.currentNoteId,
      update: Array.from(update),
    };

    this.socket.emit(COLLABORATION_EVENTS.AWARENESS_UPDATE, payload);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getCurrentNoteId(): string | null {
    return this.currentNoteId;
  }

  private setupEventListeners(): void {
    if (!this.socket) {
      return;
    }

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.handlers.onConnect?.();
    });

    this.socket.on('disconnect', (reason) => {
      this.handlers.onDisconnect?.(reason);
    });

    this.socket.on('connect_error', (error) => {
      logger.error('Collaboration connection error', {
        error,
        context: 'CollaborationClient',
      });
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.handlers.onError?.({
          message: 'Failed to connect to collaboration server',
          code: 'JOIN_FAILED',
        });
      }
    });

    this.socket.on(
      COLLABORATION_EVENTS.INITIAL_STATE,
      (response: InitialStateResponse) => {
        this.handlers.onInitialState?.(response);
      }
    );

    this.socket.on(
      COLLABORATION_EVENTS.DOCUMENT_UPDATE,
      (payload: SyncUpdatePayload) => {
        this.handlers.onDocumentUpdate?.(payload);
      }
    );

    this.socket.on(
      COLLABORATION_EVENTS.USER_JOINED,
      (user: UserJoinedPayload) => {
        this.handlers.onUserJoined?.(user);
      }
    );

    this.socket.on(
      COLLABORATION_EVENTS.USER_LEFT,
      (payload: UserLeftPayload) => {
        this.handlers.onUserLeft?.(payload);
      }
    );

    this.socket.on(
      COLLABORATION_EVENTS.AWARENESS_CHANGE,
      (payload: AwarenessUpdatePayload) => {
        this.handlers.onAwarenessChange?.(payload);
      }
    );

    this.socket.on(
      COLLABORATION_EVENTS.EDIT_DENIED,
      (error: CollaborationError) => {
        this.handlers.onEditDenied?.(error);
      }
    );

    this.socket.on(COLLABORATION_EVENTS.ERROR, (error: CollaborationError) => {
      this.handlers.onError?.(error);
    });
  }
}

export const collaborationClient = new CollaborationClient();
