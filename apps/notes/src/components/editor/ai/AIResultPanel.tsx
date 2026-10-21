import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { resolveRange, type AnchoredRange } from '@/lib/anchored-range';
import { useAIStore } from '@/stores/ai.store';
import type { Fragment, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Selection } from '@tiptap/pm/state';
import type { Editor, Range } from '@tiptap/react';
import tippy from 'tippy.js';
import type { Instance as TippyInstance } from 'tippy.js';

import { useEscapeDismiss } from '@knowtis/design-system';
import { isInLinkConfirmation, markdownToFragment } from '@knowtis/editor';

import { AIStreamingPreview } from './AIStreamingPreview';

const PARAGRAPH_NODE = 'paragraph';

interface AIResultPanelProps {
  editor: Editor;
}

function replacementContent(editor: Editor, markdown: string): Fragment {
  const blocks = markdownToFragment(markdown, editor.schema);
  const onlyBlock = blocks.childCount === 1 ? blocks.firstChild : null;
  // Inserted as a block, a one-paragraph answer would split the sentence it
  // replaces, or turn the heading it replaces into a paragraph.
  return onlyBlock?.type.name === PARAGRAPH_NODE ? onlyBlock.content : blocks;
}

function targetRange(editor: Editor, anchored: AnchoredRange | null): Range {
  const resolved = anchored ? resolveRange(editor, anchored) : null;
  if (resolved) {
    return resolved;
  }
  const { to } = editor.state.selection;
  return { from: to, to };
}

function positionAfterBlockAt(selection: Selection): number {
  const { $to } = selection;
  return $to.parent.isTextblock ? $to.after() : selection.to;
}

function positionBelow(doc: ProseMirrorNode, from: number, to: number): number {
  const $to = doc.resolve(to);
  const block = $to.parent;
  if (!block.isTextblock || block.content.size === 0) {
    return to;
  }
  if ($to.parentOffset === 0 && from < to) {
    const lastSelected = Selection.findFrom(doc.resolve($to.before()), -1);
    return lastSelected ? positionAfterBlockAt(lastSelected) : to;
  }
  return $to.after();
}

export function AIResultPanel({ editor }: AIResultPanelProps) {
  const { status, reset, cancelStream, selectionRange } = useAIStore();
  const tippyRef = useRef<TippyInstance | null>(null);
  const [portalTarget] = useState(() => document.createElement('div'));

  const isActive = status !== 'idle' && !editor.isDestroyed;
  const editorWidth = isActive
    ? editor.view.dom.getBoundingClientRect().width
    : 0;

  const handleReplace = useCallback(
    (text: string) => {
      if (editor.isDestroyed) {
        return;
      }
      editor
        .chain()
        .focus()
        .setTextSelection(targetRange(editor, selectionRange))
        .deleteSelection()
        .insertContent(replacementContent(editor, text))
        .run();
      reset();
    },
    [editor, reset, selectionRange]
  );

  const handleInsertBelow = useCallback(
    (text: string) => {
      if (editor.isDestroyed) {
        return;
      }
      const { from, to } = targetRange(editor, selectionRange);
      editor
        .chain()
        .focus()
        .insertContentAt(
          positionBelow(editor.state.doc, from, to),
          markdownToFragment(text, editor.schema)
        )
        .run();
      reset();
    },
    [editor, reset, selectionRange]
  );

  const handleDiscard = useCallback(() => {
    reset();
    editor.commands.focus();
  }, [reset, editor]);

  // The AI store is global: without this, a preview anchored in this editor's
  // note would follow the user into the next editor and apply there.
  useEffect(() => {
    return () => {
      cancelStream();
    };
  }, [editor, cancelStream]);

  useEffect(() => {
    let stopRecordingPress = () => undefined;
    let stopFollowingEdits = () => undefined;
    if (isActive) {
      const anchorRect = () => {
        const editorRect = editor.view.dom.getBoundingClientRect();
        const { bottom } = editor.view.coordsAtPos(
          targetRange(editor, selectionRange).to
        );
        return {
          width: editorRect.width,
          height: 0,
          top: bottom,
          bottom,
          left: editorRect.left,
          right: editorRect.right,
          x: editorRect.left,
          y: bottom,
          toJSON: () => ({}),
        };
      };
      let lastAnchorRect = anchorRect();

      tippyRef.current?.destroy();

      let pressTarget: EventTarget | null = null;
      const recordPress = (event: Event) => {
        pressTarget = event.target;
      };
      document.addEventListener('mousedown', recordPress, true);
      document.addEventListener('touchstart', recordPress, true);
      stopRecordingPress = () => {
        document.removeEventListener('mousedown', recordPress, true);
        document.removeEventListener('touchstart', recordPress, true);
      };

      const instance = tippy(document.body, {
        getReferenceClientRect: () => {
          if (!editor.isDestroyed) {
            lastAnchorRect = anchorRect();
          }
          return lastAnchorRect;
        },
        appendTo: () => document.body,
        content: portalTarget,
        showOnCreate: true,
        interactive: true,
        zIndex: 50,
        onHide: () => {
          const pressedLinkConfirmation = isInLinkConfirmation(pressTarget);
          pressTarget = null;
          return pressedLinkConfirmation ? false : undefined;
        },
        trigger: 'manual',
        placement: 'bottom-start',
        animation: false,
        maxWidth: 'none',
        offset: [0, 8],
      });

      tippyRef.current = instance;

      const followEdits = () => {
        void instance.popperInstance?.update();
      };
      editor.on('update', followEdits);
      stopFollowingEdits = () => {
        editor.off('update', followEdits);
      };
    } else {
      tippyRef.current?.destroy();
      tippyRef.current = null;
    }

    return () => {
      stopFollowingEdits();
      stopRecordingPress();
      tippyRef.current?.destroy();
      tippyRef.current = null;
    };
  }, [isActive, editor, selectionRange, portalTarget]);

  useEscapeDismiss(isActive, handleDiscard);

  if (!portalTarget || !isActive) {
    return null;
  }

  return createPortal(
    <AIStreamingPreview
      width={editorWidth}
      onReplace={handleReplace}
      onInsertBelow={handleInsertBelow}
      onDiscard={handleDiscard}
    />,
    portalTarget
  );
}
