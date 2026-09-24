import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { IMAGE_NODE_NAME } from '@knowtis/editor-schema';
import { logger, STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { createBaseExtensions } from '../base-extensions';
import {
  IMAGE_INSERT_META,
  isImageImportPending,
  MAX_PARALLEL_IMPORTS,
  type ImageImportOptions,
  type ImageImportProvider,
} from './image-import';
import {
  ImageUpload,
  type ImageUploadProvider,
  type UploadedImageResult,
} from './image-upload';
import { PENDING_IMAGE_SCHEME } from './pasted-image-html';

const FOREIGN = 'https://x.test/a.png';
const OTHER_FOREIGN = 'https://x.test/b.png';
const STORED = `https://${STORED_IMAGE_HOST}/notes/n1/imported-a.png`;
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const UUID = '0b6c1a52-2f7e-4d0c-9d43-5d5c8f0e8a11';
const YJS_FIELD = 'default';
const IMPORT_DURATION_MS = 1_000;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stored(
  src = STORED,
  width: number | null = null
): UploadedImageResult {
  return { src, width, height: width, alt: 'pasted-image' };
}

let editor: Editor;

function createEditor(
  imageImport: ImageImportOptions,
  { content = '<p></p>', history = false } = {}
): Editor {
  editor = new Editor({
    extensions: createBaseExtensions({
      disableHistory: !history,
      imageImport,
    }),
    content,
  });
  return editor;
}

function paste(data: Record<string, string>, files: File[] = []) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => data[type] ?? '',
      types: Object.keys(data),
      files,
    },
  });
  editor.view.dom.dispatchEvent(event);
}

function pasteHtml(html: string) {
  paste({ 'text/html': html });
}

function imageNodes(): ProseMirrorNode[] {
  const found: ProseMirrorNode[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === IMAGE_NODE_NAME) {
      found.push(node);
    }
  });
  return found;
}

function imageAttrs() {
  return imageNodes().map((node) => node.attrs);
}

function imageSrcs(): unknown[] {
  return imageNodes().map((node) => node.attrs['src']);
}

function nonEmptyBlocks(): string[][] {
  const found: string[][] = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name !== 'paragraph' || node.textContent !== '') {
      found.push([node.type.name, node.textContent]);
    }
  });
  return found;
}

function links(): string[][] {
  const found: string[][] = [];
  editor.state.doc.descendants((node) => {
    const link = node.marks.find((mark) => mark.type.name === 'link');
    if (node.isText && link) {
      found.push([node.text ?? '', String(link.attrs['href'])]);
    }
  });
  return found;
}

function docJson(): string {
  return JSON.stringify(editor.getJSON());
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (editor && !editor.isDestroyed) {
    editor.destroy();
  }
});

describe('ImageImport', () => {
  it('imports a pasted foreign image and swaps in the stored src', async () => {
    const importProvider = vi.fn().mockResolvedValue(stored());
    createEditor({ importProvider });

    pasteHtml(`<img src="${FOREIGN}" alt="A" width="640">`);
    await settle();

    expect(importProvider).toHaveBeenCalledTimes(1);
    expect(importProvider).toHaveBeenCalledWith(
      FOREIGN,
      expect.any(AbortSignal)
    );
    expect(imageAttrs()).toEqual([
      { src: STORED, alt: 'A', width: 640, height: null },
    ]);
  });

  it('marks the src as importing until its import settles', async () => {
    const pending = deferred<UploadedImageResult>();
    createEditor({ importProvider: () => pending.promise });

    pasteHtml(`<img src="${FOREIGN}">`);

    expect(isImageImportPending(editor.state, FOREIGN)).toBe(true);
    pending.resolve(stored());
    await settle();
    expect(isImageImportPending(editor.state, FOREIGN)).toBe(false);
    expect(isImageImportPending(editor.state, STORED)).toBe(false);
  });

  it('imports the images of a Markdown paste', async () => {
    const importProvider = vi.fn().mockResolvedValue(stored());
    createEditor({ importProvider });

    paste({ 'text/plain': `# Photo\n\n![a](${FOREIGN})\n` });
    await settle();

    expect(importProvider).toHaveBeenCalledWith(
      FOREIGN,
      expect.any(AbortSignal)
    );
    expect(imageSrcs()).toEqual([STORED]);
  });

  it('imports an image the paste transaction flags as an insert', async () => {
    const importProvider = vi.fn().mockResolvedValue(stored());
    createEditor({ importProvider });

    editor
      .chain()
      .setMeta(IMAGE_INSERT_META, true)
      .insertContent(`<figure data-image><img src="${FOREIGN}"></figure>`)
      .run();
    await settle();

    expect(importProvider).toHaveBeenCalledTimes(1);
    expect(imageSrcs()).toEqual([STORED]);
  });

  it('does not import an image a collaborator inserted', async () => {
    const importProvider = vi.fn().mockResolvedValue(stored());
    const yDoc = new Y.Doc();
    editor = new Editor({
      extensions: [
        ...createBaseExtensions({
          disableHistory: true,
          imageImport: { importProvider },
        }),
        Collaboration.configure({ document: yDoc, field: YJS_FIELD }),
      ],
    });

    const image = new Y.XmlElement(IMAGE_NODE_NAME);
    image.setAttribute('src', FOREIGN);
    yDoc.transact(() => {
      const fragment = yDoc.getXmlFragment(YJS_FIELD);
      fragment.insert(fragment.length, [image]);
    });
    await settle();

    expect(imageSrcs()).toEqual([FOREIGN]);
    expect(importProvider).not.toHaveBeenCalled();
    expect(isImageImportPending(editor.state, FOREIGN)).toBe(false);
  });

  it('does not import a foreign image inserted by a plain local edit', async () => {
    const importProvider = vi.fn().mockResolvedValue(stored());
    createEditor({ importProvider });

    editor.commands.insertContent(
      `<figure data-image><img src="${FOREIGN}"></figure>`
    );
    await settle();

    expect(imageSrcs()).toEqual([FOREIGN]);
    expect(importProvider).not.toHaveBeenCalled();
  });

  it('does not import a foreign image the user drags to another place', async () => {
    const importProvider = vi.fn().mockResolvedValue(stored());
    createEditor(
      { importProvider },
      {
        content: `<figure data-image><img src="${FOREIGN}"></figure><p>after</p>`,
      }
    );
    const image = editor.state.doc.child(0);

    const tr = editor.state.tr.delete(0, image.nodeSize);
    tr.insert(tr.doc.content.size, image);
    editor.view.dispatch(tr.setMeta('uiEvent', 'drop'));
    await settle();

    expect(nonEmptyBlocks()).toEqual([
      ['paragraph', 'after'],
      [IMAGE_NODE_NAME, ''],
    ]);
    expect(imageSrcs()).toEqual([FOREIGN]);
    expect(importProvider).not.toHaveBeenCalled();
  });

  it('does not bring the foreign src back on undo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const pending = deferred<UploadedImageResult>();
    createEditor({ importProvider: () => pending.promise }, { history: true });

    pasteHtml(`<p>text</p><img src="${FOREIGN}">`);
    vi.setSystemTime(Date.now() + IMPORT_DURATION_MS);
    pending.resolve(stored());
    await settle();
    expect(imageSrcs()).toEqual([STORED]);

    editor.commands.undo();

    expect(docJson()).not.toContain(FOREIGN);
  });

  it('turns an image that fails to import into a link and reports it once', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const onImportFailed = vi.fn();
    createEditor({
      importProvider: () => Promise.reject(new Error('422 fetch_failed')),
      onImportFailed,
    });

    pasteHtml(`<p>before</p><img src="${FOREIGN}" alt="Chart">`);
    await settle();

    expect(imageNodes()).toEqual([]);
    expect(nonEmptyBlocks()).toEqual([
      ['paragraph', 'before'],
      ['paragraph', 'Chart'],
    ]);
    expect(links()).toEqual([['Chart', FOREIGN]]);
    expect(onImportFailed).toHaveBeenCalledTimes(1);
    expect(onImportFailed).toHaveBeenCalledWith(1);
  });

  it('links a failed image without alt text by its URL', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    createEditor({
      importProvider: () => Promise.reject(new Error('429')),
    });

    pasteHtml(`<img src="${FOREIGN}">`);
    await settle();

    expect(links()).toEqual([[FOREIGN, FOREIGN]]);
  });

  it('reports every failed image of one paste in a single call', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const onImportFailed = vi.fn();
    createEditor({
      importProvider: () => Promise.reject(new Error('403')),
      onImportFailed,
    });

    pasteHtml(`<img src="${FOREIGN}"><img src="${OTHER_FOREIGN}">`);
    await settle();

    expect(links().map(([, href]) => href)).toEqual([FOREIGN, OTHER_FOREIGN]);
    expect(onImportFailed.mock.calls).toEqual([[2]]);
  });

  it('uploads a pasted data URI and never stores it in the document', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID);
    const upload = deferred<UploadedImageResult>();
    const uploadProvider = vi
      .fn<ImageUploadProvider>()
      .mockReturnValue(upload.promise);
    createEditor({ uploadProvider });

    pasteHtml(`<img src="${PNG_DATA_URL}" alt="shot">`);

    expect(docJson()).not.toContain('data:');
    expect(imageSrcs()).toEqual([`${PENDING_IMAGE_SCHEME}${UUID}`]);
    expect(
      uploadProvider.mock.calls.map(([file, signal]) => [
        file.type,
        signal.aborted,
      ])
    ).toEqual([['image/png', false]]);

    upload.resolve(stored(STORED, 1));
    await settle();

    expect(imageAttrs()).toEqual([
      { src: STORED, alt: 'shot', width: 1, height: 1 },
    ]);
    expect(docJson()).not.toContain('data:');
    expect(docJson()).not.toContain(PENDING_IMAGE_SCHEME);
  });

  it('removes a pasted data URI image whose upload fails', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const onImportFailed = vi.fn();
    createEditor({
      uploadProvider: () => Promise.reject(new Error('413')),
      onImportFailed,
    });

    pasteHtml(`<p>kept</p><img src="${PNG_DATA_URL}">`);
    await settle();

    expect(imageNodes()).toEqual([]);
    expect(nonEmptyBlocks()).toEqual([['paragraph', 'kept']]);
    expect(onImportFailed).toHaveBeenCalledWith(1);
  });

  it('forgets a data image the clipboard also carried as a file', async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const uploadProvider = vi.fn().mockResolvedValue(stored());
    const onImportFailed = vi.fn();
    editor = new Editor({
      extensions: [
        ...createBaseExtensions({
          disableHistory: true,
          imageImport: { uploadProvider, onImportFailed },
        }),
        ImageUpload.configure({
          provider: () => new Promise<UploadedImageResult>(() => undefined),
          onError: () => undefined,
        }),
      ],
      content: '<p></p>',
    });
    const file = new File([new Uint8Array([1])], 'copied.png', {
      type: 'image/png',
    });

    paste({ 'text/html': `<img src="${PNG_DATA_URL}">` }, [file]);
    expect(imageNodes()).toEqual([]);
    await vi.runAllTimersAsync();

    editor
      .chain()
      .setMeta(IMAGE_INSERT_META, true)
      .insertContent(
        `<figure data-image><img src="${PENDING_IMAGE_SCHEME}${UUID}"></figure>`
      )
      .run();
    await vi.runAllTimersAsync();

    expect(uploadProvider).not.toHaveBeenCalled();
    expect(imageNodes()).toEqual([]);
    expect(onImportFailed).toHaveBeenCalledWith(1);
  });

  it('imports two identical srcs of one paste with one call', async () => {
    const importProvider = vi.fn().mockResolvedValue(stored());
    createEditor({ importProvider });

    pasteHtml(`<img src="${FOREIGN}"><p>between</p><img src="${FOREIGN}">`);
    await settle();

    expect(importProvider).toHaveBeenCalledTimes(1);
    expect(imageSrcs()).toEqual([STORED, STORED]);
  });

  it('pastes a src again while it imports without a second call', async () => {
    const pending = deferred<UploadedImageResult>();
    const importProvider = vi.fn().mockReturnValue(pending.promise);
    createEditor({ importProvider });

    pasteHtml(`<img src="${FOREIGN}">`);
    pasteHtml(`<img src="${FOREIGN}">`);
    pending.resolve(stored());
    await settle();

    expect(importProvider).toHaveBeenCalledTimes(1);
    expect(imageSrcs()).toEqual([STORED, STORED]);
  });

  it('re-pastes a src whose image was deleted mid-import without a second call', async () => {
    const pending = deferred<UploadedImageResult>();
    const importProvider = vi.fn().mockReturnValue(pending.promise);
    createEditor({ importProvider });

    pasteHtml(`<img src="${FOREIGN}">`);
    editor.commands.setContent('<p></p>');
    pasteHtml(`<img src="${FOREIGN}">`);
    pending.resolve(stored());
    await settle();

    expect(importProvider).toHaveBeenCalledTimes(1);
    expect(imageSrcs()).toEqual([STORED]);
  });

  it(`runs at most ${MAX_PARALLEL_IMPORTS} imports at once`, async () => {
    const calls: Deferred<UploadedImageResult>[] = [];
    const importProvider = vi.fn<ImageImportProvider>(() => {
      const call = deferred<UploadedImageResult>();
      calls.push(call);
      return call.promise;
    });
    const importedUrls = () => importProvider.mock.calls.map(([url]) => url);
    createEditor({ importProvider });

    pasteHtml(
      ['a', 'b', 'c', 'd']
        .map((name) => `<img src="https://x.test/${name}.png">`)
        .join('')
    );
    await settle();
    expect(importedUrls()).toEqual([
      'https://x.test/a.png',
      'https://x.test/b.png',
      'https://x.test/c.png',
    ]);

    calls[0]?.resolve(stored());
    await settle();

    expect(importedUrls()).toEqual([
      'https://x.test/a.png',
      'https://x.test/b.png',
      'https://x.test/c.png',
      'https://x.test/d.png',
    ]);
  });

  it('aborts an in-flight import when the editor is destroyed', async () => {
    const signals: AbortSignal[] = [];
    const onImportFailed = vi.fn();
    createEditor({
      importProvider: (_url, signal) => {
        signals.push(signal);
        return new Promise<UploadedImageResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        });
      },
      onImportFailed,
    });

    pasteHtml(`<img src="${FOREIGN}">`);
    await settle();
    expect(signals.map((signal) => signal.aborted)).toEqual([false]);

    editor.destroy();
    await settle();

    expect(signals.map((signal) => signal.aborted)).toEqual([true]);
    expect(onImportFailed).not.toHaveBeenCalled();
  });

  it('leaves a foreign image as it is without an import provider', async () => {
    const uploadProvider = vi.fn().mockResolvedValue(stored());
    createEditor({ uploadProvider });

    pasteHtml(`<img src="${FOREIGN}">`);
    await settle();

    expect(imageSrcs()).toEqual([FOREIGN]);
    expect(isImageImportPending(editor.state, FOREIGN)).toBe(false);
    expect(uploadProvider).not.toHaveBeenCalled();
  });

  it('drops a pasted data URI without an upload provider', async () => {
    const importProvider = vi.fn().mockResolvedValue(stored());
    createEditor({ importProvider });

    pasteHtml(`<p>kept</p><img src="${PNG_DATA_URL}">`);
    await settle();

    expect(imageNodes()).toEqual([]);
    expect(docJson()).not.toContain('data:');
    expect(importProvider).not.toHaveBeenCalled();
  });
});
