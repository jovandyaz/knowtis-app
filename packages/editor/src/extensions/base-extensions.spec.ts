import { Editor, type AnyExtension } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import { AI_BLOCK_NAME } from '@knowtis/editor-schema';

import type {
  AIBlockProvider,
  AIBlockStorage,
} from './ai-block/ai-block-provider';
import { createBaseExtensions } from './base-extensions';
import type { ImageImportProvider } from './image/image-import';
import type {
  ImageUploadProvider,
  UploadedImageResult,
} from './image/image-upload';
import type { PastedImageOptions } from './image/pasted-image-html';

const PROVIDER: AIBlockProvider = {
  async *stream() {
    yield { text: 'Rome' };
  },
};

const STORED_IMAGE: UploadedImageResult = {
  src: 'https://store.test/a.png',
  width: null,
  height: null,
  alt: '',
};
const UPLOAD_PROVIDER: ImageUploadProvider = async () => STORED_IMAGE;
const IMPORT_PROVIDER: ImageImportProvider = async () => STORED_IMAGE;

let editor: Editor;

function extensionNames(extensions: AnyExtension[]): string[] {
  return extensions.map((extension) => extension.name);
}

function pasteHooks(extensions: AnyExtension[]) {
  const hookOf = (name: string) =>
    (
      extensions.find((extension) => extension.name === name)?.options as
        | PastedImageOptions
        | undefined
    )?.onDataImage;
  return {
    pastedImages: hookOf('pastedImages'),
    markdownPaste: hookOf('markdownPaste'),
  };
}

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

  it('hands one data image hook to both paste paths when pasted images can be uploaded', () => {
    const extensions = createBaseExtensions({
      imageImport: { uploadProvider: UPLOAD_PROVIDER },
    });

    const hooks = pasteHooks(extensions);
    expect(typeof hooks.pastedImages).toBe('function');
    expect(hooks.markdownPaste).toBe(hooks.pastedImages);
    expect(extensionNames(extensions)).toContain('imageImport');
  });

  it('installs no data image hook without an upload provider', () => {
    const extensions = createBaseExtensions({
      imageImport: { importProvider: IMPORT_PROVIDER },
    });

    expect(pasteHooks(extensions)).toEqual({
      pastedImages: undefined,
      markdownPaste: undefined,
    });
    expect(extensionNames(extensions)).toContain('imageImport');
  });

  it('registers no image import when its host passes no import options', () => {
    const extensions = createBaseExtensions();

    expect(pasteHooks(extensions)).toEqual({
      pastedImages: undefined,
      markdownPaste: undefined,
    });
    expect(extensionNames(extensions)).not.toContain('imageImport');
  });
});
