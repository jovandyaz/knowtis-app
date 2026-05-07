import { useEffect, useMemo, useState } from 'react';

import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import { COLLAB_CONFIG, useYjs, type CollaborativeUser } from '@knowtis/crdt';

interface UseCollaborativeEditorReturn {
  yDoc: Y.Doc;
  yXmlFragment: Y.XmlFragment;
  awareness: Awareness | null;
  currentUser: CollaborativeUser;
  isReady: boolean;
}

interface UseCollaborativeEditorOptions {
  skipProviderDelay?: boolean;
}

export function useCollaborativeEditor(
  noteId: string,
  options?: UseCollaborativeEditorOptions
): UseCollaborativeEditorReturn {
  const {
    getYDoc,
    getYText,
    getAwareness,
    currentUser,
    clearAwarenessForNote,
  } = useYjs();
  const [skipProviderDelay] = useState(() => !!options?.skipProviderDelay);
  const [isReady, setIsReady] = useState<boolean>(skipProviderDelay);

  const yDoc = useMemo(() => getYDoc(noteId), [getYDoc, noteId]);
  const awareness = useMemo(() => getAwareness(noteId), [getAwareness, noteId]);
  const yXmlFragment = useMemo(() => getYText(noteId), [getYText, noteId]);

  useEffect(() => {
    if (!yXmlFragment || !yDoc) {
      return;
    }

    if (skipProviderDelay) {
      return () => {
        clearAwarenessForNote(noteId);
      };
    }

    const timer = setTimeout(() => {
      setIsReady(true);
    }, COLLAB_CONFIG.PROVIDER_INIT_DELAY_MS);

    return () => {
      clearTimeout(timer);
      clearAwarenessForNote(noteId);
    };
  }, [yXmlFragment, yDoc, noteId, clearAwarenessForNote, skipProviderDelay]);

  return { yDoc, yXmlFragment, awareness, currentUser, isReady };
}
