import Placeholder from '@tiptap/extension-placeholder';
import { ReactNodeViewRenderer } from '@tiptap/react';

import {
  createSemanticExtensions,
  MERMAID_BLOCK_NAME,
  type NodeAttributeClasses,
} from '@knowtis/editor-schema';

import { CodeBlockView } from './code-block/CodeBlockView';
import { MarkdownPaste } from './markdown-paste';
import { MermaidBlockView } from './mermaid-block/MermaidBlockView';

interface BaseExtensionsOptions {
  openLinksOnClick?: boolean;
  disableHistory?: boolean;
}

const EDITOR_NODE_CLASSES: NodeAttributeClasses = {
  bulletList: 'list-disc list-outside ml-6',
  orderedList: 'list-decimal list-outside ml-6',
  listItem: 'leading-normal',
  blockquote:
    'border-l-2 border-muted-foreground/40 pl-4 italic text-muted-foreground',
  table: 'tiptap-table',
};

export function createBaseExtensions({
  openLinksOnClick = false,
  disableHistory = false,
}: BaseExtensionsOptions = {}) {
  const semantic = createSemanticExtensions({
    openLinksOnClick,
    disableHistory,
    classes: EDITOR_NODE_CLASSES,
  });

  const enhanced = semantic.map((extension) => {
    if (extension.name === 'codeBlock') {
      return extension.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      });
    }
    if (extension.name === MERMAID_BLOCK_NAME) {
      return extension.extend({
        addNodeView() {
          return ReactNodeViewRenderer(MermaidBlockView);
        },
      });
    }
    return extension;
  });

  return [
    ...enhanced,
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
  ];
}
