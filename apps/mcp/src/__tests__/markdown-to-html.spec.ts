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

  it('should convert GFM tables', () => {
    const result = markdownToHtml(
      '| Name | Age |\n| --- | --- |\n| Ada | 36 |'
    );
    expect(result).toContain('<table>');
    expect(result).toContain('<th>Name</th>');
    expect(result).toContain('<td>Ada</td>');
  });

  it('should convert task lists into Tiptap-compatible HTML', () => {
    const result = markdownToHtml('- [ ] todo\n- [x] done');
    expect(result).toContain('<ul data-type="taskList">');
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="false"><p>todo</p></li>'
    );
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="true"><p>done</p></li>'
    );
  });

  it('should convert highlight marks', () => {
    expect(markdownToHtml('text ==highlight== more')).toContain(
      '<mark>highlight</mark>'
    );
  });

  it('should convert superscript', () => {
    expect(markdownToHtml('x^2^')).toContain('<sup>2</sup>');
  });

  it('should convert subscript', () => {
    expect(markdownToHtml('H~2~O')).toContain('<sub>2</sub>');
  });

  it('should convert mermaid code blocks to mermaidBlock divs', () => {
    const result = markdownToHtml('```mermaid\ngraph TD\n  A --> B\n```');
    expect(result).toContain('data-mermaid-block');
    expect(result).toContain('data-code="graph TD');
    expect(result).toContain('A --&gt; B');
  });

  it('should escape HTML inside mermaid code to prevent injection', () => {
    const result = markdownToHtml('```mermaid\n<script>alert(1)</script>\n```');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should preserve non-mermaid code blocks', () => {
    const result = markdownToHtml('```javascript\nconst x = 1;\n```');
    expect(result).toContain('<pre>');
    expect(result).not.toContain('data-mermaid-block');
  });
});
