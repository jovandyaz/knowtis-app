import { renderHook } from '@testing-library/react';
import { Editor, getSchema, type AnyExtension } from '@tiptap/core';
import i18next from 'i18next';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { imagesApi } from '@knowtis/api-client';
import type * as ApiClientModule from '@knowtis/api-client';
import {
  createSemanticExtensions,
  IMAGE_NODE_NAME,
  YJS_XML_FRAGMENT_NAME,
} from '@knowtis/editor-schema';
import { enNotes } from '@knowtis/shared-i18n';
import { logger, STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { useEditorExtensions } from './useEditorExtensions';

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClientModule>()),
  imagesApi: { upload: vi.fn(), import: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const NOTE_ID = 'note-1';
const PASTED_URL = 'https://example.com/chart.png';
const OTHER_PASTED_URL = 'https://example.com/diagram.png';
const STORED_URL = `https://${STORED_IMAGE_HOST}/notes/${NOTE_ID}/imported-a1.png`;

const STORED_NODE_TYPES = [
  'aiBlock',
  'blockquote',
  'bulletList',
  'codeBlock',
  'doc',
  'hardBreak',
  'heading',
  'horizontalRule',
  'image',
  'listItem',
  'mermaidBlock',
  'orderedList',
  'paragraph',
  'table',
  'tableCell',
  'tableHeader',
  'tableRow',
  'taskItem',
  'taskList',
  'text',
];

const STORED_MARK_TYPES = [
  'bold',
  'code',
  'highlight',
  'italic',
  'link',
  'strike',
  'subscript',
  'superscript',
  'underline',
];

function collaborativeEditorExtensions(): AnyExtension[] {
  const doc = new Y.Doc();
  const { result } = renderHook(() =>
    useEditorExtensions(
      NOTE_ID,
      doc,
      doc.getXmlFragment(YJS_XML_FRAGMENT_NAME),
      null,
      { id: 'user-1', name: 'Tester', color: '#000000' },
      true,
      true
    )
  );
  return result.current;
}

function persistedTypes(extensions: readonly AnyExtension[]) {
  const schema = getSchema([...extensions]);
  return {
    nodes: Object.keys(schema.nodes).sort(),
    marks: Object.keys(schema.marks).sort(),
  };
}

describe('the collaborative editor schema', () => {
  it('writes only node and mark types the server renders into a note', () => {
    expect(persistedTypes(collaborativeEditorExtensions())).toEqual(
      persistedTypes(createSemanticExtensions())
    );
  });

  it('keeps every node and mark type a stored note can hold', () => {
    expect(persistedTypes(createSemanticExtensions())).toEqual({
      nodes: STORED_NODE_TYPES,
      marks: STORED_MARK_TYPES,
    });
  });
});

describe('pasting images from another site', () => {
  let editor: Editor | null = null;

  beforeAll(async () => {
    await i18next.init({
      lng: 'en',
      resources: { en: { notes: enNotes } },
      showSupportNotice: false,
    });
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  function pasteHtml(html: string): Editor {
    editor = new Editor({ extensions: collaborativeEditorExtensions() });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) => (type === 'text/html' ? html : ''),
        types: ['text/html'],
        files: [],
      },
    });
    editor.view.dom.dispatchEvent(event);
    return editor;
  }

  function imageSrcs(current: Editor): unknown[] {
    const found: unknown[] = [];
    current.state.doc.descendants((node) => {
      if (node.type.name === IMAGE_NODE_NAME) {
        found.push(node.attrs['src']);
      }
    });
    return found;
  }

  function links(current: Editor): string[][] {
    const found: string[][] = [];
    current.state.doc.descendants((node) => {
      const link = node.marks.find((mark) => mark.type.name === 'link');
      if (node.isText && link) {
        found.push([node.text ?? '', String(link.attrs['href'])]);
      }
    });
    return found;
  }

  it('copies the image into this note through the API', async () => {
    vi.mocked(imagesApi.import).mockResolvedValue({
      id: 'image-1',
      url: STORED_URL,
      width: null,
      height: null,
    });

    const current = pasteHtml(`<img src="${PASTED_URL}" alt="Chart">`);

    await vi.waitFor(() => expect(imageSrcs(current)).toEqual([STORED_URL]));
    expect(imagesApi.import).toHaveBeenCalledWith({
      noteId: NOTE_ID,
      url: PASTED_URL,
      signal: expect.any(AbortSignal),
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('tells the user once how many images it could not copy', async () => {
    vi.mocked(imagesApi.import).mockRejectedValue(new Error('fetch_failed'));
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const current = pasteHtml(
      `<img src="${PASTED_URL}" alt="Chart"><img src="${OTHER_PASTED_URL}" alt="Diagram">`
    );

    await vi.waitFor(() => expect(imageSrcs(current)).toEqual([]));
    expect(links(current)).toEqual([
      ['Chart', PASTED_URL],
      ['Diagram', OTHER_PASTED_URL],
    ]);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't copy 2 images into the note"
    );
  });
});
