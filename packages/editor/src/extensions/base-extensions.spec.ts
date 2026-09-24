import { Editor, type AnyExtension } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import { AI_BLOCK_NAME } from '@knowtis/editor-schema';

import type {
  AIBlockProvider,
  AIBlockStorage,
} from './ai-block/ai-block-provider';
import { createBaseExtensions } from './base-extensions';
import {
  PENDING_IMAGE_SCHEME,
  type PastedImageOptions,
} from './image/pasted-image-html';

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

  it('hands the data image hook to both the HTML and the Markdown paste paths', () => {
    const onDataImage = () => `${PENDING_IMAGE_SCHEME}token`;

    expect(
      createBaseExtensions({ onDataImage })
        .filter(
          (extension) =>
            (extension.options as PastedImageOptions).onDataImage ===
            onDataImage
        )
        .map((extension) => extension.name)
        .sort()
    ).toEqual(['markdownPaste', 'pastedImages']);
  });
});
