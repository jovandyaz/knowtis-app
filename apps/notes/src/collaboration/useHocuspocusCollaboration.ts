import { useEffect, useRef, useState } from 'react';

import {
  HocuspocusProvider,
  WebSocketStatus,
  type onAuthenticatedParameters,
  type onStatusParameters,
} from '@hocuspocus/provider';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import {
  createTokenRefreshPolicy,
  deriveWsBaseUrl,
  type RefreshOutcome,
} from '@knowtis/api-client';
import {
  COLLABORATION_CLOSE_REASON,
  HANDSHAKE_FAILURE,
} from '@knowtis/shared-types';
import { logger } from '@knowtis/shared-util';

import { getCollaborationToken } from './token-provider';

export type CollaborationStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'authenticationFailed'
  | 'accessDenied';

/**
 * Handshake verdicts about the note itself. Refreshing cannot change them, and
 * reconnecting re-asks a question whose answer is already final.
 */
const TERMINAL_HANDSHAKE_DENIALS: ReadonlySet<string> = new Set([
  HANDSHAKE_FAILURE.FORBIDDEN,
  HANDSHAKE_FAILURE.NOTE_NOT_FOUND,
]);

interface UseHocuspocusCollaborationOptions {
  noteId: string;
  yDoc: Y.Doc;
  awareness: Awareness | null;
  serverUrl: string;
  enabled?: boolean;
  shareToken?: string | undefined;
  onEditDenied?: (() => void) | undefined;
  onAccessChanged?: (() => void) | undefined;
  /** Must resolve `refreshed` only after the new token is synchronously
   *  observable via `getCollaborationToken()`'s storage. Only `rejected` ends
   *  the session; `unavailable` leaves the retry to the next reconnect. */
  onAuthRefresh?: (() => Promise<RefreshOutcome>) | undefined;
  /** Fired once after `onAuthRefresh` reports the credential is dead. */
  onSessionExpired?: (() => void) | undefined;
}

interface UseHocuspocusCollaborationReturn {
  status: CollaborationStatus;
  isConnected: boolean;
  isSynced: boolean;
  readOnly: boolean;
}

function mapStatus(status: WebSocketStatus): CollaborationStatus {
  switch (status) {
    case WebSocketStatus.Connecting:
      return 'connecting';
    case WebSocketStatus.Connected:
      return 'connected';
    case WebSocketStatus.Disconnected:
      return 'disconnected';
    default:
      // Throwing inside a provider callback would crash the connection.
      logger.warn(`Unhandled WebSocketStatus: ${String(status)}`, {
        context: 'useHocuspocusCollaboration',
      });
      return 'disconnected';
  }
}

function buildUrl(serverUrl: string, shareToken: string | undefined): string {
  if (!shareToken) {
    return serverUrl;
  }
  const separator = serverUrl.includes('?') ? '&' : '?';
  return `${serverUrl}${separator}shareToken=${encodeURIComponent(shareToken)}`;
}

/** Wraps `HocuspocusProvider` v4. Token is re-read from `TokenStorage` on every
 *  (re)connect via `getCollaborationToken`. */
export function useHocuspocusCollaboration({
  noteId,
  yDoc,
  awareness,
  serverUrl,
  enabled = true,
  shareToken,
  onEditDenied,
  onAccessChanged,
  onAuthRefresh,
  onSessionExpired,
}: UseHocuspocusCollaborationOptions): UseHocuspocusCollaborationReturn {
  const [status, setStatus] = useState<CollaborationStatus>('connecting');
  const [isSynced, setIsSynced] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const onEditDeniedRef = useRef(onEditDenied);
  const onAccessChangedRef = useRef(onAccessChanged);
  useEffect(() => {
    onAccessChangedRef.current = onAccessChanged;
  }, [onAccessChanged]);
  const onAuthRefreshRef = useRef(onAuthRefresh);
  const onSessionExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    onEditDeniedRef.current = onEditDenied;
  }, [onEditDenied]);

  useEffect(() => {
    onAuthRefreshRef.current = onAuthRefresh;
  }, [onAuthRefresh]);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  useEffect(() => {
    if (!enabled || !noteId) {
      return;
    }

    const url = buildUrl(serverUrl, shareToken);

    let disposed = false;
    let halted = false;
    let pendingRecovery = false;
    let recoveryAttempts = 0;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    const authPolicy = createTokenRefreshPolicy();

    const pauseEditing = () => {
      setReadOnly(true);
      setIsSynced(false);
    };
    const clearRecovery = () => {
      clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
      pendingRecovery = false;
    };
    const scheduleRecovery = (delayMs = 0) => {
      if (disposed || halted || pendingRecovery || recoveryTimer) {
        return;
      }
      if (recoveryAttempts >= 3) {
        halted = true;
        setStatus('disconnected');
        provider.configuration.websocketProvider.disconnect();
        return;
      }
      recoveryTimer = setTimeout(() => {
        recoveryTimer = undefined;
        if (disposed || halted) {
          return;
        }
        pendingRecovery = true;
        recoveryAttempts++;
        setStatus('connecting');
        recoveryTimer = setTimeout(() => {
          clearRecovery();
          scheduleRecovery(500 * 2 ** recoveryAttempts);
        }, 2000);
        const transport = provider.configuration.websocketProvider;
        const recovery =
          transport.status === WebSocketStatus.Connected
            ? provider.sendToken()
            : transport.connect();
        void recovery.catch(() => {
          clearRecovery();
          scheduleRecovery(500 * 2 ** recoveryAttempts);
        });
      }, delayMs);
    };
    const recoverCredentials = () => {
      void authPolicy.recover({
        refresh: () =>
          onAuthRefreshRef.current?.() ?? Promise.resolve('rejected'),
        onRefreshed: () => scheduleRecovery(),
        onUnavailable: () => scheduleRecovery(1000),
        onExhausted: () => {
          if (disposed || halted) {
            return;
          }
          halted = true;
          clearRecovery();
          provider.destroy();
          onSessionExpiredRef.current?.();
        },
        onError: () =>
          logger.warn('Collaboration credential refresh unavailable', {
            context: 'useHocuspocusCollaboration',
          }),
      });
    };

    const provider = new HocuspocusProvider({
      url,
      name: noteId,
      document: yDoc,
      awareness,
      token: getCollaborationToken,
      onStatus: ({ status: wsStatus }: onStatusParameters) => {
        if (disposed || halted) {
          return;
        }
        if (wsStatus !== WebSocketStatus.Connected) {
          pauseEditing();
        }
        setStatus(
          wsStatus === WebSocketStatus.Connected
            ? 'connecting'
            : mapStatus(wsStatus)
        );
      },
      onClose: ({ event }) => {
        if (disposed || halted) {
          return;
        }
        pauseEditing();
        if (
          event.reason === COLLABORATION_CLOSE_REASON.TOKEN_EXPIRED ||
          event.code === 4401
        ) {
          setStatus('authenticationFailed');
          recoverCredentials();
        } else if (
          event.reason === COLLABORATION_CLOSE_REASON.ACCESS_CHANGED ||
          event.reason === COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE ||
          event.code === 4403
        ) {
          setStatus('connecting');
          onAccessChangedRef.current?.();
          scheduleRecovery(
            event.reason === COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE
              ? 500
              : 0
          );
        }
      },
      onAuthenticated: ({ scope }: onAuthenticatedParameters) => {
        if (disposed || halted) {
          return;
        }
        const recovering = pendingRecovery;
        const isReadOnly = scope === 'readonly';
        setReadOnly(isReadOnly);
        if (isReadOnly) {
          onEditDeniedRef.current?.();
        }
        if (recovering) {
          onAccessChangedRef.current?.();
          provider.startSync();
        }
      },
      onAuthenticationFailed: ({ reason }) => {
        if (disposed || halted) {
          return;
        }
        clearRecovery();
        pauseEditing();
        if (TERMINAL_HANDSHAKE_DENIALS.has(reason)) {
          halted = true;
          setStatus('accessDenied');
          onAccessChangedRef.current?.();
          provider.configuration.websocketProvider.disconnect();
          return;
        }
        setStatus('authenticationFailed');
        if (reason === HANDSHAKE_FAILURE.INTERNAL_ERROR) {
          scheduleRecovery(500 * 2 ** recoveryAttempts);
          return;
        }
        recoverCredentials();
      },
      onSynced: ({ state }) => {
        if (disposed || halted) {
          return;
        }
        setIsSynced(state);
        if (state) {
          clearRecovery();
          recoveryAttempts = 0;
          authPolicy.reset();
          setStatus('connected');
        }
      },
    });

    return () => {
      disposed = true;
      clearRecovery();
      provider.destroy();
      setStatus('connecting');
      setIsSynced(false);
      setReadOnly(false);
    };
  }, [enabled, noteId, yDoc, awareness, serverUrl, shareToken]);

  return {
    status,
    isConnected: status === 'connected',
    isSynced,
    readOnly,
  };
}

const COLLABORATION_PATH = '/collaboration';

/** Resolves the WS URL from Vite env, falling back to localhost. */
export function getCollaborationServerUrl(): string {
  const env = import.meta.env;
  const wsUrl = env['VITE_WS_URL'];
  const apiUrl = env['VITE_API_URL'];

  let base: string;
  if (typeof wsUrl === 'string' && wsUrl.length > 0) {
    base = wsUrl;
  } else if (typeof apiUrl === 'string' && apiUrl.length > 0) {
    base = deriveWsBaseUrl(apiUrl);
  } else {
    base = 'http://localhost:3333';
  }

  const wsBase = base.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${wsBase}${COLLABORATION_PATH}`;
}

/** Reads `VITE_COLLABORATION_MODE` — true for `websocket` or `hybrid`. */
export function isWebSocketEnabled(): boolean {
  const mode = import.meta.env['VITE_COLLABORATION_MODE'] as string | undefined;
  return mode === 'websocket' || mode === 'hybrid';
}
