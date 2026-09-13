import { useMemo, useState } from 'react';

import { useNoteEditorStore } from '@/stores/note-editor.store';

import { useNote } from '@knowtis/data-access-notes';

export type ProposalBefore =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; title: string; contentHtml: string; isLive: boolean };

/**
 * Snapshots the target note once per proposal so the diff holds steady while the
 * user types; the capture waits for a settled fetch so the baseline is never stale.
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
  // Freezes the fallback like the live path, but only on settled data: React Query
  // serves a stale entry synchronously, and freezing that diffs the wrong baseline.
  if (
    !liveSnapshot &&
    query.isSuccess &&
    !query.isFetching &&
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
