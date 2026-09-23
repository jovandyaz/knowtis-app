import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAIStore } from '@/stores/ai.store';
import { Fragment } from '@tiptap/pm/model';
import { createNodeFromContent, type Editor } from '@tiptap/react';
import tippy from 'tippy.js';
import type { Instance as TippyInstance } from 'tippy.js';

import { useEscapeDismiss } from '@knowtis/design-system';
import { renderMarkdownToSanitizedHtml } from '@knowtis/editor';

import { AIStreamingPreview } from './AIStreamingPreview';

const PARAGRAPH_NODE = 'paragraph';

interface AIResultPanelProps {
  editor: Editor;
}

function markdownToBlocks(editor: Editor, markdown: string): Fragment {
  return Fragment.from(
    createNodeFromContent(
      renderMarkdownToSanitizedHtml(markdown),
      editor.schema
    )
  );
}

function replacementContent(editor: Editor, markdown: string): Fragment {
  const blocks = markdownToBlocks(editor, markdown);
  const onlyBlock = blocks.childCount === 1 ? blocks.firstChild : null;
  // Inserted as a block, a one-paragraph answer would split the sentence it
  // replaces, or turn the heading it replaces into a paragraph.
  return onlyBlock?.type.name === PARAGRAPH_NODE ? onlyBlock.content : blocks;
}

export function AIResultPanel({ editor }: AIResultPanelProps) {
  const { status, reset, selectionRange } = useAIStore();
  const tippyRef = useRef<TippyInstance | null>(null);
  const [portalTarget] = useState(() => document.createElement('div'));

  const isActive = status !== 'idle' && !editor.isDestroyed;
  const editorWidth = isActive
    ? editor.view.dom.getBoundingClientRect().width
    : 0;

  const handleReplace = useCallback(
    (text: string) => {
      const range = selectionRange;
      const content = replacementContent(editor, text);
      if (range) {
        editor
          .chain()
          .focus()
          .setTextSelection(range)
          .deleteSelection()
          .insertContent(content)
          .run();
      } else {
        editor.chain().focus().insertContent(content).run();
      }
      reset();
    },
    [editor, reset, selectionRange]
  );

  const handleInsertBelow = useCallback(
    (text: string) => {
      const pos = selectionRange?.to ?? editor.state.selection.to;
      editor
        .chain()
        .focus()
        .setTextSelection(pos)
        .insertContent(markdownToBlocks(editor, text))
        .run();
      reset();
    },
    [editor, reset, selectionRange]
  );

  const handleDiscard = useCallback(() => {
    reset();
    editor.commands.focus();
  }, [reset, editor]);

  useEffect(() => {
    if (isActive) {
      const proseMirrorEl = editor.view.dom;
      const editorRect = proseMirrorEl.getBoundingClientRect();

      const pos = selectionRange?.to ?? editor.state.selection.to;
      const coords = editor.view.coordsAtPos(pos);

      tippyRef.current?.destroy();

      const instance = tippy(document.body, {
        getReferenceClientRect: () => ({
          width: editorRect.width,
          height: 0,
          top: coords.bottom,
          bottom: coords.bottom,
          left: editorRect.left,
          right: editorRect.right,
          x: editorRect.left,
          y: coords.bottom,
          toJSON: () => ({}),
        }),
        appendTo: () => document.body,
        content: portalTarget,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
        animation: false,
        maxWidth: 'none',
        offset: [0, 8],
      });

      tippyRef.current = instance;
    } else {
      tippyRef.current?.destroy();
      tippyRef.current = null;
    }

    return () => {
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
