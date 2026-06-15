import { describe, expect, it } from 'vitest';

import { buildEmbeddingText, embeddingInputHash } from './embedding-text';

describe('buildEmbeddingText', () => {
  it('combines title + plaintext and truncates to the char budget', () => {
    const text = buildEmbeddingText('Title', '<p>Hello <b>world</b></p>');
    expect(text).toContain('Title');
    expect(text).toContain('Hello world');
    expect(text).not.toContain('<');
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
