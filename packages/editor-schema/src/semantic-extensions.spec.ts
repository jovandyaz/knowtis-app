import type { JSONContent } from '@tiptap/core';
import { generateHTML, generateJSON } from '@tiptap/html/server';
import { describe, expect, it } from 'vitest';

import {
  createSemanticExtensions,
  HIGHLIGHT_MARK_NAME,
} from './semantic-extensions';

const extensions = [...createSemanticExtensions()];
const BEACON = 'red; background-image: url(https://evil.example/t)';

function highlightColor(html: string): unknown {
  const [paragraph] = generateJSON(html, extensions).content ?? [];
  const [text] = paragraph?.content ?? [];
  return text?.marks?.find(
    (mark: { type: string }) => mark.type === HIGHLIGHT_MARK_NAME
  )?.attrs?.color;
}

function highlighted(color: string): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'x',
            marks: [{ type: HIGHLIGHT_MARK_NAME, attrs: { color } }],
          },
        ],
      },
    ],
  };
}

describe('highlight colour', () => {
  it.each(['#fef08a', '#BBF7D0', '#ff0'])(
    'keeps the hex colour %s',
    (color) => {
      expect(
        highlightColor(`<p><mark data-color="${color}">x</mark></p>`)
      ).toBe(color);
    }
  );

  it('reads a hex colour from the inline style when there is no data-color', () => {
    expect(
      highlightColor('<p><mark style="background-color: #bfdbfe">x</mark></p>')
    ).toBe('#bfdbfe');
  });

  it.each([
    BEACON,
    'red',
    'rgb(1, 2, 3)',
    'url(https://evil.example/t)',
    '#fef08a; color: red',
    '#12345',
    'expression(alert(1))',
  ])('drops the colour %s, which is not a hex value', (color) => {
    expect(
      highlightColor(`<p><mark data-color="${color}">x</mark></p>`)
    ).toBeNull();
  });

  it('drops a colour smuggled through the inline style', () => {
    expect(
      highlightColor(
        '<p><mark style="background-image: url(https://evil.example/t); background-color: red">x</mark></p>'
      )
    ).toBeNull();
  });

  it('renders a colour that is not a hex value as a plain highlight', () => {
    expect(generateHTML(highlighted(BEACON), extensions)).toBe(
      '<p><mark>x</mark></p>'
    );
  });

  it('renders a hex colour as the background it names', () => {
    expect(generateHTML(highlighted('#fef08a'), extensions)).toBe(
      '<p><mark data-color="#fef08a" style="background-color: #fef08a; color: inherit;">x</mark></p>'
    );
  });
});
