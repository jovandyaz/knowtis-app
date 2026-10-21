import type { Editor, Range } from '@tiptap/react';
import {
  absolutePositionToRelativePosition,
  ProsemirrorBinding,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap';
import {
  createAbsolutePositionFromRelativePosition,
  createRelativePositionFromTypeIndex,
  type AbstractType,
  type RelativePosition,
} from 'yjs';

const STICK_TO_NEXT = 0;
const STICK_TO_PREVIOUS = -1;

/** An editor range pinned to the Yjs document, so it follows local and remote edits. */
export interface AnchoredRange {
  from: RelativePosition;
  to: RelativePosition;
}

function yjsBinding(editor: Editor): ProsemirrorBinding {
  const syncState: unknown = ySyncPluginKey.getState(editor.state);
  const binding =
    typeof syncState === 'object' &&
    syncState !== null &&
    'binding' in syncState
      ? syncState.binding
      : null;
  if (!(binding instanceof ProsemirrorBinding)) {
    throw new Error(
      'Anchoring a range needs an editor bound to a Yjs document'
    );
  }
  return binding;
}

function pin(
  binding: ProsemirrorBinding,
  pos: number,
  assoc: number
): RelativePosition {
  // y-tiptap always anchors with assoc -1; re-anchoring at the same Y index
  // picks each end's stickiness.
  const located = createAbsolutePositionFromRelativePosition(
    absolutePositionToRelativePosition(pos, binding.type, binding.mapping),
    binding.doc
  );
  if (!located) {
    throw new Error(`Position ${pos} is not in the Yjs document`);
  }
  return createRelativePositionFromTypeIndex(
    located.type,
    located.index,
    assoc
  );
}

/**
 * Pins `range` to the editor's Yjs document. Each end sticks to the content
 * inside the range, so text added at its edges stays outside it. Throws when
 * the editor is not collaborative.
 */
export function anchorRange(
  editor: Editor,
  { from, to }: Range
): AnchoredRange {
  const binding = yjsBinding(editor);
  const end = pin(binding, to, STICK_TO_PREVIOUS);
  // With opposite stickiness, text typed at a collapsed range would land inside it.
  const start = from === to ? end : pin(binding, from, STICK_TO_NEXT);
  return { from: start, to: end };
}

function isInsideDeletedType(type: AbstractType<unknown>): boolean {
  let current: AbstractType<unknown> | null = type;
  while (current) {
    if (current._item?.deleted) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function resolveEnd(
  binding: ProsemirrorBinding,
  end: RelativePosition
): number | null {
  const located = createAbsolutePositionFromRelativePosition(end, binding.doc);
  // y-tiptap measures a deleted block from its parent's first live child, so
  // a position inside one resolves to an unrelated spot instead of failing.
  if (!located || isInsideDeletedType(located.type)) {
    return null;
  }
  return relativePositionToAbsolutePosition(
    binding.doc,
    binding.type,
    end,
    binding.mapping
  );
}

/**
 * Where `range` sits in the editor's current document. Collapses once its
 * content was deleted, onto the end that survives when the block holding the
 * other was deleted; `null` when neither end exists in this document anymore.
 */
export function resolveRange(
  editor: Editor,
  range: AnchoredRange
): Range | null {
  const binding = yjsBinding(editor);
  const from = resolveEnd(binding, range.from);
  const to = resolveEnd(binding, range.to);
  if (from === null) {
    return to === null ? null : { from: to, to };
  }
  return { from, to: to ?? from };
}
