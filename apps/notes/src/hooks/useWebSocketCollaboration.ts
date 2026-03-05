import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from 'sonner';
import type { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { collaborationClient } from '@knowtis/api-client';
import { useLatestRef } from '@knowtis/shared-hooks';
import type {
  CollaborationError,
  CollaborationUser,
  InitialStateResponse,
  SyncUpdatePayload,
  UserJoinedPayload,
  UserLeftPayload,
} from '@knowtis/shared-types';
import { logger } from '@knowtis/shared-util';

import { useAwarenessSync } from './useAwarenessSync';

export type CollaborationMode = 'webrtc' | 'websocket' | 'hybrid';

interface UseWebSocketCollaborationOptions {
  noteId: string | null;
  yDoc: Y.Doc | null;
  awareness?: Awareness | null;
  currentUser: { name: string; color: string };
  enabled?: boolean;
  shareToken?: string | undefined;
  onEditDenied?: (() => void) | undefined;
}

interface UseWebSocketCollaborationReturn {
  isConnected: boolean;
  isSynced: boolean;
  remoteUsers: CollaborationUser[];
  error: string | null;
}

export function useWebSocketCollaboration({
  noteId,
  yDoc,
  awareness,
  currentUser,
  enabled = true,
  shareToken,
  onEditDenied,
}: UseWebSocketCollaborationOptions): UseWebSocketCollaborationReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<CollaborationUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isJoinedRef = useRef(false);
  const yDocRef = useLatestRef(yDoc);
  const currentUserRef = useLatestRef(currentUser);
  const onEditDeniedRef = useLatestRef(onEditDenied);

  const { handleRemoteAwarenessUpdate } = useAwarenessSync({
    awareness,
    noteId,
    enabled,
    isConnected,
  });

  const handleConnect = useCallback(() => {
    setIsConnected(true);
    setError(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  const handleInitialState = useCallback(
    (response: InitialStateResponse) => {
      const doc = yDocRef.current;
      if (!doc) {
        return;
      }

      const state = new Uint8Array(response.state);
      Y.applyUpdate(doc, state, 'server-initial');
      setIsSynced(true);
      setRemoteUsers(
        response.users.filter(
          (u: CollaborationUser) => u.name !== currentUserRef.current.name
        )
      );
    },
    [yDocRef, currentUserRef]
  );

  const handleDocumentUpdate = useCallback(
    (payload: SyncUpdatePayload) => {
      const doc = yDocRef.current;
      if (!doc) {
        return;
      }

      const update = new Uint8Array(payload.update);
      Y.applyUpdate(doc, update, 'server-remote');
    },
    [yDocRef]
  );

  const handleUserJoined = useCallback(
    (user: UserJoinedPayload) => {
      if (user.name !== currentUserRef.current.name) {
        setRemoteUsers((prev) => [
          ...prev.filter((u) => u.id !== user.id),
          user,
        ]);
      }
    },
    [currentUserRef]
  );

  const handleUserLeft = useCallback((payload: UserLeftPayload) => {
    setRemoteUsers((prev) => prev.filter((u) => u.id !== payload.userId));
  }, []);

  const handleEditDenied = useCallback(
    (err: CollaborationError) => {
      logger.warn(`Edit denied: ${err.message}`, {
        context: 'useWebSocketCollaboration',
      });
      toast.error('Edit access revoked', { description: err.message });
      onEditDeniedRef.current?.();
    },
    [onEditDeniedRef]
  );

  const handleError = useCallback((err: CollaborationError) => {
    setError(err.message);
    logger.error(`WebSocket collaboration error: ${err.code}`, {
      error: err,
      context: 'useWebSocketCollaboration',
    });
    toast.error('Collaboration connection issue', {
      description: err.message,
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    collaborationClient.setHandlers({
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onInitialState: handleInitialState,
      onDocumentUpdate: handleDocumentUpdate,
      onUserJoined: handleUserJoined,
      onUserLeft: handleUserLeft,
      onAwarenessChange: handleRemoteAwarenessUpdate,
      onEditDenied: handleEditDenied,
      onError: handleError,
    });

    collaborationClient.connect({ shareToken });

    return () => {
      collaborationClient.disconnect();
    };
  }, [
    enabled,
    shareToken,
    handleConnect,
    handleDisconnect,
    handleInitialState,
    handleDocumentUpdate,
    handleUserJoined,
    handleUserLeft,
    handleRemoteAwarenessUpdate,
    handleEditDenied,
    handleError,
  ]);

  useEffect(() => {
    if (!enabled || !noteId || !isConnected) {
      return;
    }

    collaborationClient.joinRoom(noteId, {
      name: currentUserRef.current.name,
      color: currentUserRef.current.color,
    });
    isJoinedRef.current = true;

    return () => {
      if (isJoinedRef.current) {
        collaborationClient.leaveRoom();
        isJoinedRef.current = false;
      }
    };
  }, [enabled, noteId, isConnected, currentUserRef]);

  useEffect(() => {
    if (!enabled || !yDoc || !noteId || !isConnected) {
      return;
    }

    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'server-initial' || origin === 'server-remote') {
        return;
      }
      if (!isJoinedRef.current) {
        return;
      }
      collaborationClient.sendUpdate(update);
    };

    yDoc.on('update', handleUpdate);

    return () => {
      yDoc.off('update', handleUpdate);
    };
  }, [enabled, yDoc, noteId, isConnected]);

  return {
    isConnected,
    isSynced,
    remoteUsers,
    error,
  };
}

export function getCollaborationMode(): CollaborationMode {
  const mode = import.meta.env.VITE_COLLABORATION_MODE as
    | CollaborationMode
    | undefined;
  return mode || 'websocket';
}

export function isWebSocketEnabled(): boolean {
  const mode = getCollaborationMode();
  return mode === 'websocket' || mode === 'hybrid';
}
