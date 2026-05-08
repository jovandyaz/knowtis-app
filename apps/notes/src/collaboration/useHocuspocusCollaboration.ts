import { useEffect, useRef, useState } from 'react';

import {
  HocuspocusProvider,
  WebSocketStatus,
  type onAuthenticatedParameters,
  type onStatusParameters,
} from '@hocuspocus/provider';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import { logger } from '@knowtis/shared-util';

import { getCollaborationToken } from './token-provider';

export type CollaborationStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'authenticationFailed';

interface UseHocuspocusCollaborationOptions {
  noteId: string;
  yDoc: Y.Doc;
  awareness: Awareness | null;
  serverUrl: string;
  enabled?: boolean;
  shareToken?: string | undefined;
  onEditDenied?: (() => void) | undefined;
  /**
   * Called once when the server rejects the JWT mid-session. Should attempt a
   * silent refresh (e.g. `authApi.refreshToken()`) and resolve `true` when the
   * stored access token has been replaced. Resolving `false` (or rejecting) is
   * treated as terminal — the hook destroys the provider so the connection
   * does not loop with an expired token.
   */
  onAuthRefresh?: (() => Promise<boolean>) | undefined;
  /**
   * Called once after `onAuthRefresh` rejects/resolves false. Use it to surface
   * the auth failure to the user (toast, redirect to /login, etc).
   */
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
      // A future @hocuspocus/provider release may add new WebSocketStatus
      // values. Throwing inside a provider callback would propagate as an
      // uncaught exception and likely crash the connection — degrade
      // gracefully to 'disconnected' instead.
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

/**
 * Connects a Yjs document to a `@hocuspocus/server` instance via the official
 * `@hocuspocus/provider` v4 client. Uses the `Y.Doc` and `Awareness` instances
 * supplied by `@knowtis/crdt`'s `useYjs` hook so the editor and provider share
 * a single source of truth.
 *
 * Authentication is delegated to `getCollaborationToken`, which reads the
 * latest JWT from the auth `TokenStorage` on every (re)connect.
 */
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

    // `disposed` short-circuits any provider callback that fires after
    // `provider.destroy()` (e.g. a final `onStatus(Disconnected)` from the
    // socket close event) so it cannot stomp the reset state.
    let disposed = false;
    // Scoped to this provider so a fresh connection (e.g. noteId change) gets
    // a clean retry budget; a ref would persist across providers.
    let recoveryAttempted = false;

    // Note: do not call setState synchronously here — `onStatus` fires with
    // `connecting` immediately on construction and `onSynced` fires once the
    // initial sync completes, so the UI converges naturally.
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
      onAuthenticationFailed: async ({ reason }) => {
        if (disposed) {
          return;
        }
        logger.warn(`Hocuspocus authentication failed: ${reason}`, {
          context: 'useHocuspocusCollaboration',
        });
        setStatus('authenticationFailed');

        if (recoveryAttempted) {
          provider.destroy();
          onSessionExpiredRef.current?.();
          return;
        }
        recoveryAttempted = true;

        if (!onAuthRefreshRef.current) {
          provider.destroy();
          onSessionExpiredRef.current?.();
          return;
        }

        try {
          const refreshed = await onAuthRefreshRef.current();
          if (disposed) {
            return;
          }
          if (!refreshed) {
            provider.destroy();
            onSessionExpiredRef.current?.();
          }
        } catch (error) {
          logger.warn(`onAuthRefresh threw: ${String(error)}`, {
            context: 'useHocuspocusCollaboration',
          });
          if (disposed) {
            return;
          }
          provider.destroy();
          onSessionExpiredRef.current?.();
        }
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

/**
 * Resolves the WebSocket URL for the Hocuspocus collaboration server from
 * Vite env, falling back to localhost in development.
 */
export function getCollaborationServerUrl(): string {
  const env = import.meta.env;
  const wsUrl = env['VITE_WS_URL'];
  const apiUrl = env['VITE_API_URL'];

  let base: string;
  if (typeof wsUrl === 'string' && wsUrl.length > 0) {
    base = wsUrl;
  } else if (typeof apiUrl === 'string' && apiUrl.length > 0) {
    base = apiUrl.replace(/\/api(?:\/v\d+)?\/?$/, '');
  } else {
    base = 'http://localhost:3333';
  }

  const wsBase = base.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${wsBase}${COLLABORATION_PATH}`;
}

/**
 * Returns whether the Hocuspocus WebSocket transport should be enabled, based
 * on the `VITE_COLLABORATION_MODE` env var. Mirrors the previous Socket.io
 * helper so the editor's call site stays unchanged.
 */
export function isWebSocketEnabled(): boolean {
  const mode = import.meta.env['VITE_COLLABORATION_MODE'] as string | undefined;
  return mode === 'websocket' || mode === 'hybrid';
}
