import { generateHTML, generateJSON } from '@tiptap/html/server';
import { describe, expect, it } from 'vitest';

import { createSemanticExtensions } from './semantic-extensions';

const extensions = [...createSemanticExtensions()];

const STORED_FIGURE =
  '<figure data-image=""><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n/a.webp" alt="a lake" width="320" height="200"><figcaption>Lake</figcaption></figure>';

describe('ImageNode', () => {
  it('parses the stored figure into an image node with its size and caption', () => {
    const json = generateJSON(STORED_FIGURE, extensions);
    expect(json).toMatchObject({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: 'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n/a.webp',
            alt: 'a lake',
            width: 320,
            height: 200,
          },
          content: [{ type: 'text', text: 'Lake' }],
        },
      ],
    });
  });

  it('renders back to the same figure', () => {
    expect(
      generateHTML(generateJSON(STORED_FIGURE, extensions), extensions)
    ).toBe(STORED_FIGURE);
  });

  it('drops a size that is not a positive number instead of storing NaN', () => {
    const json = generateJSON(
      '<figure data-image=""><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp" alt="" width="wide" height="-4"><figcaption></figcaption></figure>',
      extensions
    );
    expect(json).toMatchObject({
      content: [{ type: 'image', attrs: { width: null, height: null } }],
    });
  });

  it('ignores a figure without an image', () => {
    const json = generateJSON(
      '<figure data-image=""><figcaption>orphan</figcaption></figure>',
      extensions
    );
    expect(JSON.stringify(json)).not.toContain('"image"');
  });
});
