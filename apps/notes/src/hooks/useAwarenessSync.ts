import { useCallback, useEffect } from 'react';

import type { Awareness } from 'y-protocols/awareness';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';

import { collaborationClient } from '@knowtis/api-client';
import { useLatestRef } from '@knowtis/shared-hooks';
import type { AwarenessUpdatePayload } from '@knowtis/shared-types';

interface UseAwarenessSyncOptions {
  awareness?: Awareness | null | undefined;
  noteId: string | null;
  enabled: boolean;
  isConnected: boolean;
}

/**
 * Syncs Yjs Awareness state (cursors, user presence) over the WebSocket
 * collaboration channel. Receives remote updates and broadcasts local changes.
 */
export function useAwarenessSync({
  awareness,
  noteId,
  enabled,
  isConnected,
}: UseAwarenessSyncOptions) {
  const awarenessRef = useLatestRef(awareness);

  const handleRemoteAwarenessUpdate = useCallback(
    (payload: AwarenessUpdatePayload) => {
      const currentAwareness = awarenessRef.current;
      if (!currentAwareness) {
        return;
      }

      const update = new Uint8Array(payload.update);
      applyAwarenessUpdate(currentAwareness, update, 'server-remote');
    },
    [awarenessRef]
  );

  useEffect(() => {
    if (!enabled || !awareness || !noteId || !isConnected) {
      return;
    }

    const handleAwarenessUpdate = (
      {
        added,
        updated,
        removed,
      }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin === 'server-remote') {
        return;
      }

      const changedClients = added.concat(updated, removed);
      const update = encodeAwarenessUpdate(awareness, changedClients);
      collaborationClient.sendAwarenessUpdate(update);
    };

    awareness.on('update', handleAwarenessUpdate);

    const initialUpdate = encodeAwarenessUpdate(awareness, [
      awareness.clientID,
    ]);
    collaborationClient.sendAwarenessUpdate(initialUpdate);

    return () => {
      awareness.off('update', handleAwarenessUpdate);
    };
  }, [enabled, awareness, noteId, isConnected]);

  return { handleRemoteAwarenessUpdate };
}
