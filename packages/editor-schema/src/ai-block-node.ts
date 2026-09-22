import { Node } from '@tiptap/core';

export const AI_BLOCK_NAME = 'aiBlock' as const;

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

const AI_BLOCK_ATTRIBUTE = 'data-ai-block';

export const AIBlockNode = Node.create({
  name: AI_BLOCK_NAME,
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
    return [{ tag: `div[${AI_BLOCK_ATTRIBUTE}]` }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', { ...HTMLAttributes, [AI_BLOCK_ATTRIBUTE]: '' }];
  },
});
