import { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSemanticExtensions,
  IMAGE_NODE_NAME,
} from '@knowtis/editor-schema';
import { logger } from '@knowtis/shared-util';

import {
  MAX_DATA_IMAGE_CHARS,
  PASTED_IMAGE_SCHEMES,
  PastedImages,
  PENDING_IMAGE_SCHEME,
  wrapPastedImages,
  type PastedImageOptions,
} from './pasted-image-html';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const GIF_BASE64 = 'R0lGODlhAQABAAAAADs=';
const JPEG_BASE64 = '/9j/4AAQ';
const WEBP_BASE64 = 'UklGRg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const TOKEN = `${PENDING_IMAGE_SCHEME}0b6c1a52-2f7e-4d0c-9d43-5d5c8f0e8a11`;

interface FigureImage {
  src: string | null;
  alt: string | null;
  width: string | null;
  height: string | null;
}

function parse(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

function figureImages(html: string): FigureImage[] {
  return Array.from(parse(html).querySelectorAll('figure[data-image]')).map(
    (figure) => {
      const img = figure.querySelector('img');
      return {
        src: img?.getAttribute('src') ?? null,
        alt: img?.getAttribute('alt') ?? null,
        width: img?.getAttribute('width') ?? null,
        height: img?.getAttribute('height') ?? null,
      };
    }
  );
}

function topLevel(html: string): string[][] {
  return Array.from(parse(html).children).map((element) => [
    element.tagName.toLowerCase(),
    element.textContent ?? '',
  ]);
}

function recordingHook(token = TOKEN) {
  const files: File[] = [];
  const onDataImage = (file: File): string => {
    files.push(file);
    return token;
  };
  return { files, onDataImage };
}

function bytesOf(file: File): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      if (result === null || typeof result === 'string') {
        reject(new Error('expected an ArrayBuffer'));
        return;
      }
      resolve(Array.from(new Uint8Array(result)));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function decoded(base64: string): number[] {
  return Array.from(Buffer.from(base64, 'base64'));
}

// jsdom parses the whole ~14 MB paste, which outlasts the default timeout
// when the suite shares the machine with other projects' workers.
const OVERSIZED_PASTE_TIMEOUT_MS = 30_000;

describe('wrapPastedImages', () => {
  it('wraps a bare remote img into an image figure with its src and alt', () => {
    expect(
      figureImages(wrapPastedImages('<img src="https://x.test/a.png" alt="A">'))
    ).toEqual([
      { src: 'https://x.test/a.png', alt: 'A', width: null, height: null },
    ]);
  });

  it('keeps http and https sources', () => {
    expect(PASTED_IMAGE_SCHEMES).toEqual(['http:', 'https:']);
    expect(
      figureImages(
        wrapPastedImages(
          '<img src="http://x.test/a.png"><img src="https://x.test/b.png">'
        )
      ).map((image) => image.src)
    ).toEqual(['http://x.test/a.png', 'https://x.test/b.png']);
  });

  it('splits a paragraph around an img in the middle of its text', () => {
    expect(
      topLevel(
        wrapPastedImages('<p>before <img src="https://x.test/a.png"> after</p>')
      )
    ).toEqual([
      ['p', 'before '],
      ['figure', ''],
      ['p', ' after'],
    ]);
  });

  it('leaves no empty paragraph behind an img that fills its paragraph', () => {
    expect(
      topLevel(wrapPastedImages('<p> <img src="https://x.test/a.png"><br></p>'))
    ).toEqual([['figure', '']]);
  });

  it('lifts an img out of a link inside a paragraph, keeping the link text', () => {
    const html = wrapPastedImages(
      '<p>see <a href="https://x.test/">link <img src="https://x.test/a.png"> end</a> tail</p>'
    );

    expect(topLevel(html)).toEqual([
      ['p', 'see link '],
      ['figure', ''],
      ['p', ' end tail'],
    ]);
    expect(
      Array.from(parse(html).querySelectorAll('a')).map((a) => a.textContent)
    ).toEqual(['link ', ' end']);
  });

  it('splits one paragraph around each of several imgs', () => {
    expect(
      topLevel(
        wrapPastedImages(
          '<p>a<img src="https://x.test/1.png">b<img src="https://x.test/2.png">c</p>'
        )
      )
    ).toEqual([
      ['p', 'a'],
      ['figure', ''],
      ['p', 'b'],
      ['figure', ''],
      ['p', 'c'],
    ]);
  });

  it.each([
    ['image/png', PNG_BASE64, 'png'],
    ['image/gif', GIF_BASE64, 'gif'],
    ['image/jpeg', JPEG_BASE64, 'jpeg'],
    ['image/webp', WEBP_BASE64, 'webp'],
  ])(
    'hands a %s data URI to the hook as a file and uses the token it returns',
    async (type, base64, extension) => {
      const { files, onDataImage } = recordingHook();

      const html = wrapPastedImages(
        `<img src="data:${type};base64,${base64}" alt="shot">`,
        { onDataImage }
      );

      expect(figureImages(html)).toEqual([
        { src: TOKEN, alt: 'shot', width: null, height: null },
      ]);
      expect(files.map((file) => [file.type, file.name])).toEqual([
        [type, `pasted-image.${extension}`],
      ]);
      expect(await bytesOf(files[0])).toEqual(decoded(base64));
    }
  );

  it('accepts a data URI whose scheme, type and encoding are upper case', () => {
    const { files, onDataImage } = recordingHook();

    const html = wrapPastedImages(
      `<img src="DATA:image/PNG;BASE64,${PNG_BASE64}">`,
      { onDataImage }
    );

    expect(figureImages(html).map((image) => image.src)).toEqual([TOKEN]);
    expect(files.map((file) => file.type)).toEqual(['image/png']);
  });

  it('drops only the image whose data hook throws, and logs why', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const failure = new Error('upload registry unavailable');
    const onDataImage = (): string => {
      throw failure;
    };

    const html = wrapPastedImages(
      `<p>kept</p><img src="${PNG_DATA_URL}"><img src="https://x.test/a.png">`,
      { onDataImage }
    );

    expect(topLevel(html)).toEqual([
      ['p', 'kept'],
      ['figure', ''],
    ]);
    expect(figureImages(html).map((image) => image.src)).toEqual([
      'https://x.test/a.png',
    ]);
    expect(warn.mock.calls).toEqual([
      [
        'Dropped a pasted image its data hook rejected',
        { context: 'PastedImages', error: failure },
      ],
    ]);
  });

  it('drops a data URI when no hook is given', () => {
    const html = wrapPastedImages(`<p>x</p><img src="${PNG_DATA_URL}">`);

    expect(figureImages(html)).toEqual([]);
    expect(html).not.toContain('data:');
  });

  it('drops a data URI when the hook returns something other than a pending token', () => {
    const { onDataImage } = recordingHook(PNG_DATA_URL);

    const html = wrapPastedImages(`<img src="${PNG_DATA_URL}">`, {
      onDataImage,
    });

    expect(figureImages(html)).toEqual([]);
    expect(html).not.toContain('data:');
  });

  it(
    'drops a data URI longer than the cap without decoding it',
    { timeout: OVERSIZED_PASTE_TIMEOUT_MS },
    () => {
      const atob = vi.spyOn(globalThis, 'atob');
      const { files, onDataImage } = recordingHook();
      const oversized = `data:image/png;base64,${'A'.repeat(MAX_DATA_IMAGE_CHARS)}`;

      const html = wrapPastedImages(`<img src="${oversized}">`, {
        onDataImage,
      });

      expect(figureImages(html)).toEqual([]);
      expect(files).toEqual([]);
      expect(atob).not.toHaveBeenCalled();
    }
  );

  it('caps a data URI at the base64 length of 10 MB plus its prefix', () => {
    const tenMegabytes = 10 * 1024 * 1024;
    expect(MAX_DATA_IMAGE_CHARS).toBeGreaterThanOrEqual(
      `data:image/jpeg;base64,`.length + 4 * Math.ceil(tenMegabytes / 3)
    );
    expect(MAX_DATA_IMAGE_CHARS).toBeLessThan(
      Math.ceil((tenMegabytes * 4) / 3) + 100
    );
  });

  it('drops a data URI that is not valid base64', () => {
    const { files, onDataImage } = recordingHook();

    const html = wrapPastedImages('<img src="data:image/png;base64,%%%">', {
      onDataImage,
    });

    expect(figureImages(html)).toEqual([]);
    expect(files).toEqual([]);
  });

  it.each([
    ['an svg data URI', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['a non-base64 data URI', 'data:image/png,rawbytes'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a blob: URL', 'blob:https://x.test/0b6c1a52'],
    ['a file: URL', 'file:///C:/a.png'],
    ['a relative src', 'images/a.png'],
    ['a pending token', TOKEN],
    ['an empty src', ''],
    ['a URL carrying a username and password', 'https://u:p@x.test/a.png'],
    ['a URL carrying a username', 'https://u@x.test/a.png'],
  ])('removes an img with %s', (_label, src) => {
    const { files, onDataImage } = recordingHook();

    const html = wrapPastedImages(`<p>text</p><img src="${src}">`, {
      onDataImage,
    });

    expect(figureImages(html)).toEqual([]);
    expect(parse(html).querySelector('img')).toBeNull();
    expect(files).toEqual([]);
  });

  it('carries positive integer width and height attributes', () => {
    expect(
      figureImages(
        wrapPastedImages(
          '<img src="https://x.test/a.png" width="640" height="480">'
        )
      )
    ).toEqual([
      { src: 'https://x.test/a.png', alt: '', width: '640', height: '480' },
    ]);
  });

  it('falls back to px inline styles for width and height', () => {
    expect(
      figureImages(
        wrapPastedImages(
          '<img src="https://x.test/a.png" width="100%" style="width: 320px; height: 200px">'
        )
      )
    ).toEqual([
      { src: 'https://x.test/a.png', alt: '', width: '320', height: '200' },
    ]);
  });

  it('ignores dimensions that are not positive integers', () => {
    expect(
      figureImages(
        wrapPastedImages(
          '<img src="https://x.test/a.png" width="12.5" height="0" style="width: 50%; height: -4px">'
        )
      )
    ).toEqual([
      { src: 'https://x.test/a.png', alt: '', width: null, height: null },
    ]);
  });

  it.each([
    ['hexadecimal', '0x10'],
    ['exponent', '1e3'],
    ['signed', '+640'],
    ['beyond the pixel cap', '10001'],
  ])('ignores a %s dimension', (_label, value) => {
    expect(
      figureImages(
        wrapPastedImages(
          `<img src="https://x.test/a.png" width="${value}" height="${value}">`
        )
      )
    ).toEqual([
      { src: 'https://x.test/a.png', alt: '', width: null, height: null },
    ]);
  });

  it('keeps a dimension at the pixel cap', () => {
    expect(
      figureImages(
        wrapPastedImages(
          '<img src="https://x.test/a.png" width="10000" style="height: 10000px">'
        )
      )
    ).toEqual([
      { src: 'https://x.test/a.png', alt: '', width: '10000', height: '10000' },
    ]);
  });

  it('does not double-wrap an img already inside an image figure', () => {
    const html = wrapPastedImages(
      '<figure data-image><img src="https://x.test/a.png" alt="A"><figcaption>cap</figcaption></figure>'
    );

    expect(figureImages(html)).toEqual([
      { src: 'https://x.test/a.png', alt: 'A', width: null, height: null },
    ]);
    expect(parse(html).querySelectorAll('figure')).toHaveLength(1);
  });

  it('keeps a figure copied from the editor whose image has no stored src', () => {
    const html = wrapPastedImages(
      '<figure data-image><img alt="A"><figcaption></figcaption></figure>'
    );

    expect(figureImages(html)).toEqual([
      { src: null, alt: 'A', width: null, height: null },
    ]);
  });

  it('applies the data URI rule inside an existing image figure', () => {
    const { onDataImage } = recordingHook();
    const figure = `<figure data-image><img src="${PNG_DATA_URL}" alt="A"><figcaption></figcaption></figure>`;

    expect(figureImages(wrapPastedImages(figure, { onDataImage }))).toEqual([
      { src: TOKEN, alt: 'A', width: null, height: null },
    ]);
    expect(wrapPastedImages(figure)).not.toContain('data:');
  });

  it('preserves the alt text and escapes it', () => {
    const html = wrapPastedImages(
      '<img src="https://x.test/a.png" alt="a &quot;b&quot; &lt;i&gt;c&lt;/i&gt; &amp; d">'
    );

    expect(figureImages(html).map((image) => image.alt)).toEqual([
      'a "b" <i>c</i> & d',
    ]);
    expect(parse(html).querySelector('i')).toBeNull();
  });

  it('returns HTML without images untouched', () => {
    const html = '<p data-pm-slice="1 1 []">plain <b>text</b></p>';

    expect(wrapPastedImages(html)).toBe(html);
  });
});

let editor: Editor;

function createEditor(options: PastedImageOptions = {}) {
  editor = new Editor({
    extensions: [
      ...createSemanticExtensions(),
      PastedImages.configure(options),
    ],
    content: '<p></p>',
  });
  return editor;
}

function pasteHtml(html: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/html' ? html : ''),
      types: ['text/html'],
      files: [],
    },
  });
  editor.view.dom.dispatchEvent(event);
}

function images(): ProseMirrorNode[] {
  const found: ProseMirrorNode[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === IMAGE_NODE_NAME) {
      found.push(node);
    }
  });
  return found;
}

function imageAttrs() {
  return images().map((node) => node.attrs);
}

function blocks(): string[][] {
  const found: string[][] = [];
  editor.state.doc.forEach((node) => {
    found.push([node.type.name, node.textContent]);
  });
  return found;
}

afterEach(() => {
  vi.restoreAllMocks();
  editor?.destroy();
});

describe('PastedImages', () => {
  it('turns a bare pasted img into an image node', () => {
    createEditor();

    pasteHtml('<img src="https://x.test/a.png" alt="A">');

    expect(imageAttrs()).toEqual([
      { src: 'https://x.test/a.png', alt: 'A', width: null, height: null },
    ]);
  });

  it('splits a pasted paragraph around its image', () => {
    createEditor();

    pasteHtml('<p>before <img src="https://x.test/a.png"> after</p>');

    expect(blocks()).toEqual([
      ['paragraph', 'before'],
      [IMAGE_NODE_NAME, ''],
      ['paragraph', 'after'],
    ]);
  });

  it('keeps an image pasted inside a link', () => {
    createEditor();

    pasteHtml('<a href="https://x.test/"><img src="https://x.test/a.png"></a>');

    expect(imageAttrs().map((attrs) => attrs['src'])).toEqual([
      'https://x.test/a.png',
    ]);
  });

  it('keeps an image pasted from another ProseMirror editor', () => {
    createEditor();

    pasteHtml(
      '<p data-pm-slice="1 1 []"><img src="https://x.test/a.png" alt="A">caption</p>'
    );

    expect(imageAttrs().map((attrs) => attrs['src'])).toEqual([
      'https://x.test/a.png',
    ]);
    expect(editor.state.doc.textContent).toBe('caption');
  });

  it('carries pasted width and height onto the image node', () => {
    createEditor();

    pasteHtml('<img src="https://x.test/a.png" width="640" height="480">');

    expect(
      imageAttrs().map((attrs) => [attrs['width'], attrs['height']])
    ).toEqual([[640, 480]]);
  });

  it('stores the hook token instead of a pasted data URI', () => {
    const { files, onDataImage } = recordingHook();
    createEditor({ onDataImage });

    pasteHtml(`<img src="${PNG_DATA_URL}" alt="shot">`);

    expect(imageAttrs().map((attrs) => attrs['src'])).toEqual([TOKEN]);
    expect(files.map((file) => file.type)).toEqual(['image/png']);
  });

  it('keeps the rest of the paste when the data hook throws', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    createEditor({
      onDataImage: () => {
        throw new Error('upload registry unavailable');
      },
    });

    pasteHtml(`<p>kept</p><img src="${PNG_DATA_URL}">`);

    expect(images()).toEqual([]);
    expect(editor.state.doc.textContent).toBe('kept');
  });

  it('closes a heading at a pasted image and keeps the text after it as a paragraph', () => {
    createEditor();

    pasteHtml('<h1>Title <img src="https://x.test/a.png"> more</h1>');

    expect(blocks()).toEqual([
      ['heading', 'Title'],
      [IMAGE_NODE_NAME, ''],
      ['paragraph', ' more'],
    ]);
  });

  it('keeps an image and the text around it inside a list item without a paragraph', () => {
    createEditor();

    pasteHtml('<ul><li>one <img src="https://x.test/a.png"> two</li></ul>');

    const itemChildren: string[][] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'listItem') {
        node.forEach((child) => {
          itemChildren.push([child.type.name, child.textContent]);
        });
      }
    });
    expect(itemChildren).toEqual([
      ['paragraph', 'one'],
      [IMAGE_NODE_NAME, ''],
      ['paragraph', ' two'],
    ]);
  });

  it('keeps a pasted data URI out of the document without a hook', () => {
    createEditor();

    pasteHtml(`<p>kept</p><img src="${PNG_DATA_URL}">`);

    expect(images()).toEqual([]);
    expect(JSON.stringify(editor.getJSON())).not.toContain('data:');
    expect(editor.state.doc.textContent).toBe('kept');
  });

  it('does not duplicate an image pasted as an existing figure', () => {
    createEditor();

    pasteHtml(
      '<figure data-image><img src="https://x.test/a.png" alt="A"><figcaption></figcaption></figure>'
    );

    expect(imageAttrs()).toEqual([
      { src: 'https://x.test/a.png', alt: 'A', width: null, height: null },
    ]);
  });
});
