import { useMemo } from 'react';

import { useNoteEditorStore } from '@/stores/note-editor.store';

import { useNote } from '@knowtis/data-access-notes';

export type ProposalBefore =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; title: string; contentHtml: string; isLive: boolean };

/**
 * Snapshots the target note once per proposal so the review diff stays put
 * while the user keeps typing; falls back to the cached note otherwise.
 */
export function useProposalBefore(
  proposalId: string,
  targetNoteId: string
): ProposalBefore {
  const liveEditor = useNoteEditorStore((s) =>
    s.noteId === targetNoteId ? s.editor : null
  );
  const liveTitle = useNoteEditorStore((s) =>
    s.noteId === targetNoteId ? s.title : ''
  );
  const liveSnapshot = useMemo(
    () =>
      liveEditor && !liveEditor.isDestroyed
        ? { title: liveTitle, contentHtml: liveEditor.getHTML() }
        : null,
    // liveTitle is read once on purpose: the snapshot must not follow typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposalId, liveEditor]
  );
  const query = useNote(liveSnapshot ? undefined : targetNoteId);

  if (liveSnapshot) {
    return { status: 'ready', isLive: true, ...liveSnapshot };
  }
  if (query.data) {
    return {
      status: 'ready',
      isLive: false,
      title: query.data.title,
      contentHtml: query.data.content,
    };
  }
  if (query.isError) {
    return { status: 'error' };
  }
  return { status: 'loading' };
}
