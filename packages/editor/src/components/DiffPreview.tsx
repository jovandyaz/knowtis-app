import { useEffect, useMemo, useRef, useState } from 'react';

import type { AnyExtension } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';

import type { DocDiff } from '../diff/diff-note-html';
import {
  ProposalDiff,
  type ProposalDiffLabels,
} from '../extensions/proposal-diff';

export interface DiffPreviewProps {
  diff: DocDiff;
  extensions: AnyExtension[];
  showDeleted: boolean;
  currentIndex: number | null;
  labels: ProposalDiffLabels;
  className?: string;
}

const NONE_EXPANDED: ReadonlySet<number> = new Set();

/**
 * Renders the proposed document read-only; deletions live only in decorations,
 * so nothing here can reach the collaborative Yjs doc.
 */
export function DiffPreview({
  diff,
  extensions,
  showDeleted,
  currentIndex,
  labels,
  className,
}: DiffPreviewProps) {
  const [expanded, setExpanded] = useState(NONE_EXPANDED);
  const [expandedForDiff, setExpandedForDiff] = useState(diff);
  const containerRef = useRef<HTMLDivElement>(null);
  const allExtensions = useMemo(
    () => [...extensions, ProposalDiff],
    [extensions]
  );
  const editor = useEditor(
    {
      extensions: allExtensions,
      content: diff.after.toJSON(),
      editable: false,
    },
    [diff, allExtensions]
  );

  if (diff !== expandedForDiff) {
    setExpandedForDiff(diff);
    setExpanded(NONE_EXPANDED);
  }

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }
    editor.commands.setProposalDiffView({
      before: diff.before,
      changes: diff.changes,
      showDeleted,
      currentIndex,
      expanded,
      labels,
    });
  }, [editor, diff, showDeleted, currentIndex, expanded, labels]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const onClick = (event: Event) => {
      const chip = (event.target as HTMLElement).closest<HTMLElement>(
        '[data-diff-chip]'
      );
      if (!chip) {
        return;
      }
      const index = Number(chip.getAttribute('data-change'));
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    };
    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, []);

  return (
    <div ref={containerRef} className={className}>
      <EditorContent editor={editor} />
    </div>
  );
}
