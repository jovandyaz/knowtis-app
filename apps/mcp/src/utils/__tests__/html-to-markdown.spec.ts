import { describe, expect, it } from 'vitest';

import { htmlToMarkdown } from '../html-to-markdown.js';
import { markdownToHtml } from '../markdown-to-html.js';

describe('htmlToMarkdown', () => {
  it('should convert basic formatting', () => {
    const md = htmlToMarkdown(
      '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> text.</p>'
    );
    expect(md).toContain('## Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('_italic_');
  });

  it('should convert Tiptap task lists to GFM checkboxes', () => {
    const html =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="true"><p>done item</p></li>' +
      '<li data-type="taskItem" data-checked="false"><p>todo item</p></li>' +
      '</ul>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('- [x] done item');
    expect(md).toContain('- [ ] todo item');
  });

  it('should convert mark, sub, and sup with markdown-it round-trip syntax', () => {
    const md = htmlToMarkdown(
      '<p><mark>hi</mark> H<sub>2</sub>O x<sup>2</sup></p>'
    );
    expect(md).toContain('==hi==');
    expect(md).toContain('H~2~O');
    expect(md).toContain('x^2^');
  });

  it('should convert mermaid blocks back to fenced code', () => {
    const md = htmlToMarkdown(
      '<div data-mermaid-block data-code="graph TD;&#10;A--&gt;B"></div>'
    );
    expect(md).toContain('```mermaid');
    expect(md).toContain('A-->B');
  });

  it('should convert strikethrough and tables (GFM)', () => {
    const md = htmlToMarkdown(
      '<p><s>gone</s></p><table><tr><th>H</th></tr><tr><td>v</td></tr></table>'
    );
    expect(md).toContain('~~gone~~');
    expect(md).toContain('| H |');
    expect(md).toContain('| v |');
  });

  it('should round-trip through markdownToHtml', () => {
    const original = [
      '## Notes',
      '',
      '- [x] ship F2',
      '- [ ] ship F3',
      '',
      'Some ==highlighted== text and H~2~O.',
    ].join('\n');
    const roundTripped = htmlToMarkdown(markdownToHtml(original));
    expect(roundTripped).toContain('- [x] ship F2');
    expect(roundTripped).toContain('- [ ] ship F3');
    expect(roundTripped).toContain('==highlighted==');
    expect(roundTripped).toContain('H~2~O');
  });
});
