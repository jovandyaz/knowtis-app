import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { COLLAB_CONFIG, isInvalidStateError } from '@/lib';
import { BROADCAST_MESSAGE_TYPES } from '@/lib/collaboration.constants';
import type {
  BroadcastMessage,
  CollaborativeUser,
  YjsContextValue,
} from '@/types';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { logger } from '@knowtis/shared-util';

import { YjsContext } from './YjsContext';
import {
  cleanupResources,
  createInitialUser,
  createMessageHandler,
} from './YjsProvider.helpers';
import type { DocumentResources, YjsProviderProps } from './YjsProvider.types';

export function YjsProvider({ children }: YjsProviderProps) {
  const resourcesRef = useRef<DocumentResources>({
    docs: new Map(),
    persistence: new Map(),
    awareness: new Map(),
  });
  const channelRef = useRef<BroadcastChannel | null>(null);

  const [currentUser] = useState<CollaborativeUser>(createInitialUser);
  const [activeUsers, setActiveUsers] = useState<
    Map<string, CollaborativeUser[]>
  >(new Map());

  useEffect(() => {
    const resources = resourcesRef.current;
    channelRef.current = new BroadcastChannel(COLLAB_CONFIG.CHANNEL_NAME);

    const handleMessage = createMessageHandler(resources, setActiveUsers);
    channelRef.current.addEventListener('message', handleMessage);

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setActiveUsers((prev) => {
        const newMap = new Map(prev);
        let hasChanges = false;

        newMap.forEach((users, noteId) => {
          const activeUsers = users.filter((user) => {
            const isStale =
              user.lastSeen &&
              now - user.lastSeen > COLLAB_CONFIG.STALE_USER_TIMEOUT_MS;
            return !isStale;
          });

          if (activeUsers.length !== users.length) {
            hasChanges = true;
            newMap.set(noteId, activeUsers);
          }
        });

        return hasChanges ? newMap : prev;
      });
    }, COLLAB_CONFIG.PRESENCE_INTERVAL_MS);

    return () => {
      clearInterval(cleanupInterval);
      cleanupResources(resources);
      channelRef.current?.removeEventListener('message', handleMessage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  const getYDoc = useCallback((noteId: string): Y.Doc => {
    const resources = resourcesRef.current;
    let doc = resources.docs.get(noteId);

    if (!doc) {
      doc = new Y.Doc();
      resources.docs.set(noteId, doc);

      const persistence = new IndexeddbPersistence(`note-${noteId}`, doc);
      resources.persistence.set(noteId, persistence);

      doc.on('update', (update: Uint8Array) => {
        try {
          channelRef.current?.postMessage({
            type: BROADCAST_MESSAGE_TYPES.UPDATE,
            noteId,
            updates: Array.from(update),
          } satisfies BroadcastMessage);
        } catch (error) {
          if (!isInvalidStateError(error)) {
            logger.warn('Failed to broadcast document update', {
              error,
              context: 'YjsProvider',
            });
          }
        }
      });
    }

    return doc;
  }, []);

  const getYText = useCallback(
    (noteId: string): Y.XmlFragment => {
      const doc = getYDoc(noteId);
      return doc.getXmlFragment('content');
    },
    [getYDoc]
  );

  const getAwareness = useCallback(
    (noteId: string): Awareness | null => {
      const resources = resourcesRef.current;
      let awareness = resources.awareness.get(noteId);

      if (!awareness) {
        const doc = resources.docs.get(noteId);
        if (!doc) {
          return null;
        }

        awareness = new Awareness(doc);
        awareness.setLocalStateField('user', {
          name: currentUser.name,
          color: currentUser.color,
        });
        resources.awareness.set(noteId, awareness);
      }

      return awareness;
    },
    [currentUser.name, currentUser.color]
  );

  const broadcastPresence = useCallback(
    (noteId: string) => {
      try {
        channelRef.current?.postMessage({
          type: BROADCAST_MESSAGE_TYPES.PRESENCE,
          noteId,
          user: currentUser,
        } satisfies BroadcastMessage);
      } catch (error) {
        if (!isInvalidStateError(error)) {
          logger.warn('Failed to broadcast presence', {
            error,
            context: 'YjsProvider',
          });
        }
      }
    },
    [currentUser]
  );

  const broadcastLeave = useCallback(
    (noteId: string) => {
      try {
        channelRef.current?.postMessage({
          type: BROADCAST_MESSAGE_TYPES.LEAVE,
          noteId,
          user: currentUser,
        } satisfies BroadcastMessage);
      } catch (error) {
        if (!isInvalidStateError(error)) {
          logger.warn('Failed to broadcast leave', {
            error,
            context: 'YjsProvider',
          });
        }
      }
    },
    [currentUser]
  );

  const clearAwarenessForNote = useCallback((noteId: string) => {
    const awareness = resourcesRef.current.awareness.get(noteId);
    if (awareness) {
      awareness.setLocalStateField('cursor', null);
    }
  }, []);

  useEffect(() => {
    const resources = resourcesRef.current;

    return () => {
      resources.docs.forEach((_, noteId) => {
        try {
          channelRef.current?.postMessage({
            type: BROADCAST_MESSAGE_TYPES.LEAVE,
            noteId,
            user: currentUser,
          } satisfies BroadcastMessage);
        } catch (error) {
          if (!isInvalidStateError(error)) {
            logger.warn('Failed to broadcast leave event', {
              error,
              context: 'YjsProvider',
            });
          }
        }
      });
    };
  }, [currentUser]);

  const value = useMemo<YjsContextValue>(
    () => ({
      getYDoc,
      getYText,
      getAwareness,
      currentUser,
      activeUsers,
      broadcastPresence,
      broadcastLeave,
      clearAwarenessForNote,
    }),
    [
      getYDoc,
      getYText,
      getAwareness,
      currentUser,
      activeUsers,
      broadcastPresence,
      broadcastLeave,
      clearAwarenessForNote,
    ]
  );

  return <YjsContext.Provider value={value}>{children}</YjsContext.Provider>;
}
