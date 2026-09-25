import type { JSONContent } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html/server';
import { describe, expect, it } from 'vitest';

import { markdownToHtml } from '@knowtis/note-markdown';

import { noteSchemaExtensions } from './note-schema';
import { restoreStoredAttributes } from './stored-attributes';

const parsed = (html: string): JSONContent =>
  generateJSON(html, noteSchemaExtensions);

const storedHtml = (html: string): string =>
  generateHTML(parsed(html), noteSchemaExtensions);

function nodesOfType(node: JSONContent, type: string): JSONContent[] {
  return [
    ...(node.type === type ? [node] : []),
    ...(node.content ?? []).flatMap((child) => nodesOfType(child, type)),
  ];
}

const SRC =
  'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/lake.webp';
const OTHER =
  'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/map.webp';
const SIZED = storedHtml(
  `<p>Trip</p><figure data-image=""><img src="${SRC}" alt="lake" width="320" height="200"><figcaption></figcaption></figure><p>Old text.</p>`
);

function imageAttrs(html: string) {
  return nodesOfType(parsed(html), 'image').map((n) => n.attrs);
}

describe('restoreStoredAttributes: image size', () => {
  it('gives a converted image back the size the stored body had for the same src', () => {
    const proposed = markdownToHtml(`Trip\n\n![lake](${SRC})\n\nNew text.`);
    const restored = restoreStoredAttributes(SIZED, proposed);
    expect(imageAttrs(restored)).toEqual([
      { src: SRC, alt: 'lake', width: 320, height: 200 },
    ]);
    expect(restored).toContain('New text.');
  });

  it('returns the proposal untouched when the stored body has no sized image', () => {
    const unsized = storedHtml(
      `<figure data-image=""><img src="${SRC}" alt="lake"><figcaption></figcaption></figure>`
    );
    const proposed = markdownToHtml(`![lake](${SRC})`);
    expect(restoreStoredAttributes(unsized, proposed)).toBe(proposed);
  });

  it('leaves an image the model added at its natural size', () => {
    const proposed = markdownToHtml(`![map](${OTHER})`);
    expect(restoreStoredAttributes(SIZED, proposed)).toBe(proposed);
  });

  it('does not override a size the proposal already carries', () => {
    const proposed = `<figure data-image=""><img src="${SRC}" alt="lake" width="100" height="50"><figcaption></figcaption></figure>`;
    expect(imageAttrs(restoreStoredAttributes(SIZED, proposed))).toEqual([
      { src: SRC, alt: 'lake', width: 100, height: 50 },
    ]);
  });
});

describe('restoreStoredAttributes: image size by order of occurrence', () => {
  it('gives each copy of a repeated src the size of the copy at the same position', () => {
    const stored = storedHtml(
      `<figure data-image=""><img src="${SRC}" alt="a" width="100" height="50"><figcaption></figcaption></figure>` +
        `<figure data-image=""><img src="${SRC}" alt="b"><figcaption></figcaption></figure>` +
        `<figure data-image=""><img src="${SRC}" alt="c" width="300" height="150"><figcaption></figcaption></figure>`
    );
    const proposed = markdownToHtml(
      `![a](${SRC})\n\n![b](${SRC})\n\n![c](${SRC})`
    );
    expect(
      imageAttrs(restoreStoredAttributes(stored, proposed)).map((attrs) => [
        attrs?.['width'] ?? null,
        attrs?.['height'] ?? null,
      ])
    ).toEqual([
      [100, 50],
      [null, null],
      [300, 150],
    ]);
  });
});

const DIAGRAM = (code: string, viewMode: string) =>
  `<div data-mermaid-block="" data-code="${code}" data-view-mode="${viewMode}"></div>`;

function viewModes(html: string) {
  return nodesOfType(parsed(html), 'mermaidBlock').map(
    (n) => n.attrs?.['viewMode']
  );
}

describe('restoreStoredAttributes: diagram view mode', () => {
  it('gives a converted diagram back the view mode stored for the same code', () => {
    const stored = storedHtml(
      DIAGRAM('graph TD', 'code') + DIAGRAM('graph LR', 'preview')
    );
    const proposed = markdownToHtml(
      '```mermaid\ngraph TD\n```\n\n```mermaid\ngraph LR\n```'
    );
    expect(viewModes(restoreStoredAttributes(stored, proposed))).toEqual([
      'code',
      'preview',
    ]);
  });

  it('matches code the converter trimmed of trailing newlines', () => {
    const stored = storedHtml(DIAGRAM('graph TD\n', 'code'));
    const proposed = markdownToHtml('```mermaid\ngraph TD\n```');
    expect(viewModes(restoreStoredAttributes(stored, proposed))).toEqual([
      'code',
    ]);
  });

  it('leaves a diagram whose code changed in the default view', () => {
    const stored = storedHtml(DIAGRAM('graph TD', 'code'));
    const proposed = markdownToHtml('```mermaid\ngraph TB\n```');
    expect(restoreStoredAttributes(stored, proposed)).toBe(proposed);
  });
});

const COLORED = (text: string, color: string) =>
  `<mark data-color="${color}" style="background-color: ${color}; color: inherit">${text}</mark>`;

function highlightColors(html: string): unknown[] {
  const colors: unknown[] = [];
  const walk = (node: JSONContent) => {
    for (const mark of node.marks ?? []) {
      if (mark.type === 'highlight') {
        colors.push(mark.attrs?.['color']);
      }
    }
    (node.content ?? []).forEach(walk);
  };
  walk(parsed(html));
  return colors;
}

describe('restoreStoredAttributes: highlight colour', () => {
  it('gives converted highlighted text back the colour stored for the same text', () => {
    const stored = storedHtml(
      `<p>${COLORED('sunscreen', '#ffc078')} and ${COLORED('water', '#8ce99a')}</p><p>Old text.</p>`
    );
    const proposed = markdownToHtml('==sunscreen== and ==water==\n\nNew text.');
    expect(highlightColors(restoreStoredAttributes(stored, proposed))).toEqual([
      '#ffc078',
      '#8ce99a',
    ]);
  });

  it('takes repeated highlighted text in order of occurrence', () => {
    const stored = storedHtml(
      `<p>${COLORED('x', '#ffc078')} ${COLORED('x', '#8ce99a')}</p>`
    );
    const proposed = markdownToHtml('==x== ==x==');
    expect(highlightColors(restoreStoredAttributes(stored, proposed))).toEqual([
      '#ffc078',
      '#8ce99a',
    ]);
  });

  it('leaves a highlight whose text changed without the old colour', () => {
    const stored = storedHtml(`<p>${COLORED('sunscreen', '#ffc078')}</p>`);
    const proposed = markdownToHtml('==sun cream==');
    expect(restoreStoredAttributes(stored, proposed)).toBe(proposed);
  });

  it('never gives a highlight a colour the stored body did not have', () => {
    const stored = storedHtml('<p><mark>sunscreen</mark></p>');
    const proposed = markdownToHtml('==sunscreen==');
    expect(restoreStoredAttributes(stored, proposed)).toBe(proposed);
  });

  it('never restores a colour that is not a hex value, even from a body the schema did not write', () => {
    const hostile = `<p>${COLORED('sunscreen', 'red; background-image: url(https://evil.example/t)')} and more</p>`;
    const proposed = markdownToHtml('==sunscreen== and less');

    expect(highlightColors(hostile)).toEqual([null]);
    expect(storedHtml(hostile)).toBe('<p><mark>sunscreen</mark> and more</p>');
    expect(restoreStoredAttributes(hostile, proposed)).toBe(proposed);
    expect(restoreStoredAttributes(storedHtml(hostile), proposed)).toBe(
      proposed
    );
  });
});
