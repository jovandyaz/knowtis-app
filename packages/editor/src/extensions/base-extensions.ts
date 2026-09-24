import type { AnyExtension } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import { ReactNodeViewRenderer } from '@tiptap/react';

import {
  AI_BLOCK_NAME,
  createSemanticExtensions,
  IMAGE_NODE_NAME,
  MERMAID_BLOCK_NAME,
  type NodeAttributeClasses,
} from '@knowtis/editor-schema';

import type {
  AIBlockProvider,
  AIBlockStorage,
} from './ai-block/ai-block-provider';
import { AIBlockView } from './ai-block/AIBlockView';
import { CodeBlockView } from './code-block/CodeBlockView';
import {
  createImageImport,
  type ImageImportOptions,
} from './image/image-import';
import { ImageView } from './image/ImageView';
import { PastedImages } from './image/pasted-image-html';
import { MarkdownPaste } from './markdown-paste';
import { MermaidBlockView } from './mermaid-block/MermaidBlockView';

interface BaseExtensionsOptions {
  openLinksOnClick?: boolean;
  disableHistory?: boolean;
  aiBlockProvider?: AIBlockProvider | null;
  imageImport?: ImageImportOptions;
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
  aiBlockProvider = null,
  imageImport,
}: BaseExtensionsOptions = {}): AnyExtension[] {
  const importer = imageImport ? createImageImport(imageImport) : null;
  const pastedImageOptions = importer?.onDataImage
    ? { onDataImage: importer.onDataImage }
    : {};

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
    if (extension.name === IMAGE_NODE_NAME) {
      return extension.extend({
        addNodeView() {
          return ReactNodeViewRenderer(ImageView);
        },
      });
    }
    if (extension.name === AI_BLOCK_NAME) {
      return extension.extend({
        addStorage(): AIBlockStorage {
          return { provider: aiBlockProvider };
        },
        addNodeView() {
          return ReactNodeViewRenderer(AIBlockView);
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
          return `Heading ${node.attrs['level']}`;
        }
        if (node.type.name === 'codeBlock') {
          return 'Write code...';
        }
        return '';
      },
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
    }),
    PastedImages.configure(pastedImageOptions),
    MarkdownPaste.configure(pastedImageOptions),
    ...(importer ? [importer.extension] : []),
  ];
}
