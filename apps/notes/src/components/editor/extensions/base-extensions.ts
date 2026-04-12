import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import { CodeBlockView } from './code-block/CodeBlockView';
import { lowlight } from './code-block/lowlight-instance';
import { MarkdownPaste } from './markdown-paste';
import { MermaidBlockNode } from './mermaid-block';

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
      link: {
        openOnClick: openLinksOnClick,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
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
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({
      resizable: false,
      HTMLAttributes: { class: 'tiptap-table' },
    }),
    TableRow,
    TableHeader,
    TableCell,
    Superscript,
    Subscript,
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') {
          return `Heading ${node.attrs.level}`;
        }
        if (node.type.name === 'codeBlock') {
          return 'Write code...';
        }
        return '';
      },
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
    }),
    MarkdownPaste,
    MermaidBlockNode,
  ];
}
