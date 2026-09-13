import { useMemo, useState } from 'react';

import { useNoteEditorStore } from '@/stores/note-editor.store';

import { useNote } from '@knowtis/data-access-notes';

export type ProposalBefore =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; title: string; contentHtml: string; isLive: boolean };

/**
 * Snapshots the target note once per proposal so the diff holds steady while
 * the user types; staleness at commit is caught by the server's baseVersion check.
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

  const [frozenFallback, setFrozenFallback] = useState<{
    proposalId: string;
    title: string;
    contentHtml: string;
  } | null>(null);
  // Freezes the fallback like the live path: once resolved for this proposal,
  // later cache invalidations of the same query must not move it.
  if (
    !liveSnapshot &&
    query.data &&
    frozenFallback?.proposalId !== proposalId
  ) {
    setFrozenFallback({
      proposalId,
      title: query.data.title,
      contentHtml: query.data.content,
    });
  }

  if (liveSnapshot) {
    return { status: 'ready', isLive: true, ...liveSnapshot };
  }
  if (frozenFallback && frozenFallback.proposalId === proposalId) {
    return {
      status: 'ready',
      isLive: false,
      title: frozenFallback.title,
      contentHtml: frozenFallback.contentHtml,
    };
  }
  if (query.isError) {
    return { status: 'error' };
  }
  return { status: 'loading' };
}
