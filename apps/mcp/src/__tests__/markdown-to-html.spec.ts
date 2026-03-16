import { describe, expect, it } from 'vitest';

import { markdownToHtml } from '../utils/markdown-to-html.js';

describe('markdownToHtml', () => {
  it('should convert headings', () => {
    expect(markdownToHtml('# Title')).toBe('<h1>Title</h1>\n');
    expect(markdownToHtml('## Subtitle')).toBe('<h2>Subtitle</h2>\n');
    expect(markdownToHtml('### Section')).toBe('<h3>Section</h3>\n');
  });

  it('should convert links', () => {
    const result = markdownToHtml('[Example](https://example.com)');
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain('Example</a>');
  });

  it('should auto-linkify URLs', () => {
    const result = markdownToHtml('Visit https://example.com today');
    expect(result).toContain('<a href="https://example.com"');
  });

  it('should convert fenced code blocks', () => {
    const result = markdownToHtml('```javascript\nconst x = 1;\n```');
    expect(result).toContain('<pre>');
    expect(result).toContain('<code');
    expect(result).toContain('const x = 1;');
  });

  it('should convert inline formatting', () => {
    expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>');
    expect(markdownToHtml('*italic*')).toContain('<em>italic</em>');
    expect(markdownToHtml('`code`')).toContain('<code>code</code>');
    expect(markdownToHtml('~~strike~~')).toContain('<s>strike</s>');
  });

  it('should convert lists', () => {
    const bullet = markdownToHtml('- item 1\n- item 2');
    expect(bullet).toContain('<ul>');
    expect(bullet).toContain('<li>item 1</li>');

    const ordered = markdownToHtml('1. first\n2. second');
    expect(ordered).toContain('<ol>');
    expect(ordered).toContain('<li>first</li>');
  });

  it('should return empty paragraph for empty input', () => {
    expect(markdownToHtml('')).toBe('');
  });

  it('should not render raw HTML (html: false)', () => {
    const result = markdownToHtml('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
  });
});
