import { useEffect, useMemo, useState } from 'react';

import type * as Y from 'yjs';

import { COLLAB_CONFIG, useYjs, type CollaborativeUser } from '@knowtis/crdt';

interface UseCollaborativeEditorReturn {
  yDoc: Y.Doc;
  yXmlFragment: Y.XmlFragment;
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
  const { getYDoc, getYText, currentUser } = useYjs();
  const [skipProviderDelay] = useState(() => !!options?.skipProviderDelay);
  const [isReady, setIsReady] = useState<boolean>(skipProviderDelay);

  const yDoc = useMemo(() => getYDoc(noteId), [getYDoc, noteId]);
  const yXmlFragment = useMemo(() => getYText(noteId), [getYText, noteId]);

  useEffect(() => {
    if (skipProviderDelay) {
      return;
    }

    const timer = setTimeout(() => {
      setIsReady(true);
    }, COLLAB_CONFIG.PROVIDER_INIT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [skipProviderDelay]);

  return { yDoc, yXmlFragment, currentUser, isReady };
}
