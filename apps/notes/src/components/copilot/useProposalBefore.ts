import { useState } from 'react';

import { useNoteEditorStore } from '@/stores/note-editor.store';
import type { Editor } from '@tiptap/react';

import { useNote } from '@knowtis/data-access-notes';
import { isTrivialProseMirrorDoc } from '@knowtis/editor-schema';

export type ProposalBefore =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; title: string; contentHtml: string; isLive: boolean };

interface Baseline {
  title: string;
  contentHtml: string;
}

// An editor attaches ~100ms after mount, before Hocuspocus has synced, so its
// document is briefly empty; that emptiness is not the note's "before" version.
function liveBaseline(editor: Editor | null, title: string): Baseline | null {
  if (
    !editor ||
    editor.isDestroyed ||
    isTrivialProseMirrorDoc(editor.state.doc)
  ) {
    return null;
  }
  return { title, contentHtml: editor.getHTML() };
}

/**
 * Snapshots the target note once per proposal, from whichever source first holds
 * a real document, so the diff holds steady while the user types and never
 * re-baselines when the note is opened mid-review.
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

  const [frozen, setFrozen] = useState<{
    proposalId: string;
    baseline: Baseline;
  } | null>(null);

  const captured = frozen?.proposalId === proposalId ? frozen.baseline : null;
  const live = captured ? null : liveBaseline(liveEditor, liveTitle);
  const query = useNote(captured || live ? undefined : targetNoteId);

  if (!captured) {
    if (live) {
      setFrozen({ proposalId, baseline: live });
    } else if (query.isSuccess && !query.isFetching) {
      // React Query serves a stale entry synchronously, and freezing that would
      // diff the wrong baseline, so the fallback waits for a settled fetch.
      setFrozen({
        proposalId,
        baseline: { title: query.data.title, contentHtml: query.data.content },
      });
    }
  }

  const baseline = captured ?? live;
  if (baseline) {
    return {
      status: 'ready',
      isLive: liveEditor !== null,
      title: baseline.title,
      contentHtml: baseline.contentHtml,
    };
  }
  if (query.isError) {
    return { status: 'error' };
  }
  return { status: 'loading' };
}
