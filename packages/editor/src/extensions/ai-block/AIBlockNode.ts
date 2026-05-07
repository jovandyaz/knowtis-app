import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import type { GhostTextStreamChunk, GhostTextStreamInput } from '../ghost-text';
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

/**
 * Provider input for AIBlock streams. The block only sends a topic as
 * `content`, so the input shape is a strict subset of the GhostText
 * contract — reusing the chunk type avoids needless divergence.
 */
export type AIBlockStreamInput = Pick<
  GhostTextStreamInput,
  'content' | 'signal'
>;

export type AIBlockStreamChunk = GhostTextStreamChunk;

export interface AIBlockProvider {
  stream(input: AIBlockStreamInput): AsyncIterable<AIBlockStreamChunk>;
}

export interface AIBlockOptions {
  /**
   * Provider that performs the AI "learn topic" stream. Required at
   * runtime; when null the block surfaces an inline error in the view.
   */
  provider: AIBlockProvider | null;
}

export interface AIBlockStorage {
  provider: AIBlockProvider | null;
}

/**
 * Tiptap node that streams an AI "learn topic" explanation in-place.
 *
 * **Configuration is required.** Consumers MUST call `.configure({ provider })`
 * with an `AIBlockProvider` implementation; without it the block renders the
 * generic error state (no provider configured). Example:
 *
 * ```ts
 * AIBlockNode.configure({ provider: createAiClientProvider(AI_ACTION.LEARN_TOPIC) });
 * ```
 */
export const AIBlockNode = Node.create<AIBlockOptions, AIBlockStorage>({
  name: 'aiBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      provider: null,
    };
  },

  addStorage() {
    return {
      provider: null,
    };
  },

  onCreate() {
    // Tiptap calls onCreate after option merge; mirror provider into typed
    // storage so views can read it without string-based extension lookup.
    this.storage.provider = this.options.provider;
  },

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
