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
import { HANDSHAKE_FAILURE } from '@knowtis/shared-types';
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
  onAuthRefresh,
  onSessionExpired,
}: UseHocuspocusCollaborationOptions): UseHocuspocusCollaborationReturn {
  const [status, setStatus] = useState<CollaborationStatus>('connecting');
  const [isSynced, setIsSynced] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const onEditDeniedRef = useRef(onEditDenied);
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

    // Short-circuits provider callbacks that fire after `provider.destroy()`.
    let disposed = false;
    // Per-provider so a fresh connection resets the retry budget.
    const authPolicy = createTokenRefreshPolicy();

    const provider = new HocuspocusProvider({
      url,
      name: noteId,
      document: yDoc,
      awareness,
      token: getCollaborationToken,
      onStatus: ({ status: wsStatus }: onStatusParameters) => {
        if (disposed) {
          return;
        }
        setStatus(mapStatus(wsStatus));
      },
      onAuthenticated: ({ scope }: onAuthenticatedParameters) => {
        if (disposed) {
          return;
        }
        const isReadOnly = scope === 'readonly';
        setReadOnly(isReadOnly);
        if (isReadOnly) {
          onEditDeniedRef.current?.();
        }
      },
      onAuthenticationFailed: ({ reason }) => {
        if (disposed) {
          return;
        }
        logger.warn(`Hocuspocus authentication failed: ${reason}`, {
          context: 'useHocuspocusCollaboration',
        });
        if (TERMINAL_HANDSHAKE_DENIALS.has(reason)) {
          setStatus('accessDenied');
          provider.destroy();
          return;
        }
        setStatus('authenticationFailed');
        // The server itself failed; a new token cannot change that answer, so
        // the reconnect keeps the retry without spending the refresh attempt.
        if (reason === HANDSHAKE_FAILURE.INTERNAL_ERROR) {
          return;
        }

        // Credential reasons — and anything unrecognised, which an older server
        // collapses into 'permission-denied' — get the single refresh attempt.
        void authPolicy.recover({
          refresh: () =>
            onAuthRefreshRef.current?.() ?? Promise.resolve('rejected'),
          // v4 auto-reconnect re-invokes getToken() on next onOpen, both to pick
          // up a fresh token and to retry one the server never judged; destroy
          // would block either.
          onRefreshed: () => {},
          onUnavailable: () => {},
          onExhausted: () => {
            if (disposed) {
              return;
            }
            provider.destroy();
            onSessionExpiredRef.current?.();
          },
          onError: (error) =>
            logger.warn(`onAuthRefresh threw: ${String(error)}`, {
              context: 'useHocuspocusCollaboration',
            }),
        });
      },
      onSynced: ({ state }) => {
        if (disposed) {
          return;
        }
        setIsSynced(state);
      },
    });

    return () => {
      disposed = true;
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
