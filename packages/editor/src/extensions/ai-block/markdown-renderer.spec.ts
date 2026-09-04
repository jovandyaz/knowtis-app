import { describe, expect, it } from 'vitest';

import { renderMarkdownToSanitizedHtml } from './markdown-renderer';

describe('renderMarkdownToSanitizedHtml', () => {
  it('strips images produced by markdown image syntax', () => {
    const result = renderMarkdownToSanitizedHtml(
      '![x](https://evil.example/x)'
    );
    expect(result).not.toContain('<img');
  });

  it('renders a mermaid fence as the mermaid block element with its code', () => {
    const code = 'graph TD\n  A[Start<br/>here] --> B\n';
    const result = renderMarkdownToSanitizedHtml('```mermaid\n' + code + '```');

    const doc = new DOMParser().parseFromString(result, 'text/html');
    const block = doc.querySelector('div[data-mermaid-block]');
    expect(block?.getAttribute('data-code')).toBe(code.trim());
    expect(doc.querySelector('pre')).toBeNull();
  });

  it('keeps a non-mermaid fence as a code block', () => {
    const result = renderMarkdownToSanitizedHtml('```ts\nconst a = 1;\n```');
    expect(result).toContain('<pre><code class="language-ts">');
    expect(result).not.toContain('data-mermaid-block');
  });

  it('keeps stripping arrow-bearing attributes outside the mermaid block', () => {
    const result = renderMarkdownToSanitizedHtml(
      '[x](https://a.example "see -->")'
    );
    expect(result).toContain('<a href="https://a.example"');
    expect(result).not.toContain('title=');
  });
});
