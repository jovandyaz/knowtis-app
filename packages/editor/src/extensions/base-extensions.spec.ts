import { Editor, type AnyExtension } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import { AI_BLOCK_NAME } from '@knowtis/editor-schema';

import type {
  AIBlockProvider,
  AIBlockStorage,
} from './ai-block/ai-block-provider';
import { createBaseExtensions } from './base-extensions';

const PROVIDER: AIBlockProvider = {
  async *stream() {
    yield { text: 'Rome' };
  },
};

let editor: Editor;

function aiBlockStorage(
  extensions: AnyExtension[]
): AIBlockStorage | undefined {
  editor = new Editor({ element: document.createElement('div'), extensions });
  return (
    editor.storage as Partial<Record<typeof AI_BLOCK_NAME, AIBlockStorage>>
  )[AI_BLOCK_NAME];
}

afterEach(() => {
  if (editor && !editor.isDestroyed) {
    editor.destroy();
  }
});

describe('createBaseExtensions', () => {
  it('hands the AI block the stream provider its host passes', () => {
    expect(
      aiBlockStorage(createBaseExtensions({ aiBlockProvider: PROVIDER }))
        ?.provider
    ).toBe(PROVIDER);
  });

  it('leaves the AI block without a provider when its host passes none', () => {
    expect(aiBlockStorage(createBaseExtensions())?.provider).toBeNull();
  });
});
