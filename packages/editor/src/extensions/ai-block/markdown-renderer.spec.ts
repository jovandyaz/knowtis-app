import { describe, expect, it } from 'vitest';

import { renderMarkdownToSanitizedHtml } from './markdown-renderer';

describe('renderMarkdownToSanitizedHtml', () => {
  it('strips images produced by markdown image syntax', () => {
    const result = renderMarkdownToSanitizedHtml(
      '![x](https://evil.example/x)'
    );
    expect(result).not.toContain('<img');
  });
});
