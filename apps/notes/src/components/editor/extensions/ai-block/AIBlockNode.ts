import { Node, ReactNodeViewRenderer } from '@tiptap/react';

import { AIBlockView } from './AIBlockView';

export const AI_BLOCK_STATUS = {
  INPUT: 'input',
  STREAMING: 'streaming',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type AIBlockStatus =
  (typeof AI_BLOCK_STATUS)[keyof typeof AI_BLOCK_STATUS];

export interface AIBlockAttributes {
  topic: string;
  status: AIBlockStatus;
  content: string;
  errorMessage: string;
}

export const AIBlockNode = Node.create({
  name: 'aiBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      topic: { default: '' },
      status: { default: AI_BLOCK_STATUS.INPUT },
      content: { default: '' },
      errorMessage: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-ai-block]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', { ...HTMLAttributes, 'data-ai-block': '' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AIBlockView);
  },
});
