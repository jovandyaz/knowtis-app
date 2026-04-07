import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import { CodeBlockView } from './code-block/CodeBlockView';
import { lowlight } from './code-block/lowlight-instance';

interface BaseExtensionsOptions {
  openLinksOnClick?: boolean;
  undoRedo?: false;
}

export function createBaseExtensions({
  openLinksOnClick = false,
  undoRedo,
}: BaseExtensionsOptions = {}) {
  return [
    StarterKit.configure({
      codeBlock: false,
      ...(undoRedo === false && { undoRedo }),
      heading: { levels: [1, 2, 3] },
      bulletList: {
        HTMLAttributes: { class: 'list-disc list-outside ml-6' },
      },
      orderedList: {
        HTMLAttributes: { class: 'list-decimal list-outside ml-6' },
      },
      listItem: {
        HTMLAttributes: { class: 'leading-normal' },
      },
      blockquote: {
        HTMLAttributes: {
          class:
            'border-l-2 border-muted-foreground/40 pl-4 italic text-muted-foreground',
        },
      },
    }),
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: null,
    }).extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }),
    Link.configure({
      openOnClick: openLinksOnClick,
      HTMLAttributes: {
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
    Underline,
  ];
}
