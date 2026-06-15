import { describe, expect, it } from 'vitest';

import { buildEmbeddingText, embeddingInputHash } from './embedding-text';

describe('buildEmbeddingText', () => {
  it('combines title + plaintext and strips markup', () => {
    const text = buildEmbeddingText('Title', '<p>Hello <b>world</b></p>');
    expect(text).toContain('Title');
    expect(text).toContain('Hello world');
    expect(text).not.toContain('<');
  });

  it('truncates the combined text to the char budget', () => {
    const longContent = `<p>${'a'.repeat(40_000)}</p>`;
    const text = buildEmbeddingText('Title', longContent);
    expect(text).toHaveLength(28_000);
  });
});

describe('embeddingInputHash', () => {
  it('is stable for the same inputs and changes with content', () => {
    const a = embeddingInputHash('t', 'c', 'voyage-4');
    const b = embeddingInputHash('t', 'c', 'voyage-4');
    const c = embeddingInputHash('t', 'c2', 'voyage-4');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
