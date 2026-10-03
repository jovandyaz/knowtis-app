import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';
import { logger } from '@knowtis/shared-util';

import { isInvalidStateError } from './collaboration';
import {
  BROADCAST_MESSAGE_TYPES,
  COLLAB_CONFIG,
} from './collaboration.constants';
import type {
  BroadcastMessage,
  CollaborativeUser,
  YjsContextValue,
} from './collaboration.types';
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
  });
  const channelRef = useRef<BroadcastChannel | null>(null);

  const [currentUser] = useState<CollaborativeUser>(createInitialUser);

  useEffect(() => {
    const resources = resourcesRef.current;
    channelRef.current = new BroadcastChannel(COLLAB_CONFIG.CHANNEL_NAME);

    const handleMessage = createMessageHandler(resources);
    channelRef.current.addEventListener('message', handleMessage);

    return () => {
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
      return doc.getXmlFragment(YJS_XML_FRAGMENT_NAME);
    },
    [getYDoc]
  );

  const value = useMemo<YjsContextValue>(
    () => ({ getYDoc, getYText, currentUser }),
    [getYDoc, getYText, currentUser]
  );

  return <YjsContext.Provider value={value}>{children}</YjsContext.Provider>;
}
