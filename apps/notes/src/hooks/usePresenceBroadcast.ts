import { useEffect } from 'react';

import { COLLAB_CONFIG, useYjs } from '@knowtis/crdt';

/**
 * Hook for broadcasting user presence in a collaborative note
 * @param noteId - The ID of the note to broadcast presence for
 */
interface UsePresenceBroadcastOptions {
  enabled?: boolean;
}

export function usePresenceBroadcast(
  noteId: string,
  { enabled = true }: UsePresenceBroadcastOptions = {}
): void {
  const { broadcastPresence, broadcastLeave } = useYjs();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    broadcastPresence(noteId);

    const interval = setInterval(
      () => broadcastPresence(noteId),
      COLLAB_CONFIG.PRESENCE_INTERVAL_MS
    );

    return () => {
      clearInterval(interval);
      broadcastLeave(noteId);
    };
  }, [noteId, broadcastPresence, broadcastLeave, enabled]);
}
