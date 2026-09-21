import { describe, expect, it } from 'vitest';

import { htmlToMarkdown } from './html-to-markdown';
import { markdownToHtml } from './markdown-to-html';

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

  it('should escape literal delimiters so they do not re-parse as marks', () => {
    const cases: { text: string; visible: string }[] = [
      { text: 'x == y == z', visible: 'x == y == z' },
      { text: 'H~2~O', visible: 'H~2~O' },
      { text: '2^3^', visible: '2^3^' },
      { text: 'a~~b~~c', visible: 'a~~b~~c' },
    ];
    for (const { text, visible } of cases) {
      const html = markdownToHtml(htmlToMarkdown(`<p>${text}</p>`));
      expect(html).not.toContain('<mark>');
      expect(html).not.toContain('<sub>');
      expect(html).not.toContain('<sup>');
      expect(html).not.toContain('<s>');
      expect(html).toContain(visible);
    }
  });

  it('should escape literal brackets so plain text cannot re-parse as a link', () => {
    expect(htmlToMarkdown('<p>done [truncated]</p>')).toBe(
      'done \\[truncated\\]'
    );
    expect(htmlToMarkdown('<p>see [note] here</p>')).toBe(
      'see \\[note\\] here'
    );

    const roundTripped = markdownToHtml(
      htmlToMarkdown('<p>[a](https://x.test)</p>')
    );
    expect(roundTripped).not.toContain('<a href="https://x.test">a</a>');
    expect(roundTripped).toContain('[a](');
  });

  it('should keep intended marks intact after the escape override', () => {
    expect(htmlToMarkdown('<p><mark>hi</mark></p>')).toContain('==hi==');
    expect(htmlToMarkdown('<p>H<sub>2</sub>O</p>')).toContain('~2~');
    expect(htmlToMarkdown('<p>x<sup>3</sup></p>')).toContain('^3^');
    expect(htmlToMarkdown('<p><s>gone</s></p>')).toContain('~~gone~~');
  });

  it('should round-trip a document co-locating sup, table, strike, mermaid and sub', () => {
    const original = [
      'E = mc^2^ with ~~old~~ and H~2~O.',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```mermaid',
      'graph TD;',
      'A-->B',
      '```',
    ].join('\n');
    const roundTripped = htmlToMarkdown(markdownToHtml(original));
    expect(roundTripped).toContain('mc^2^');
    expect(roundTripped).toContain('~~old~~');
    expect(roundTripped).toContain('H~2~O');
    expect(roundTripped).toContain('| A | B |');
    expect(roundTripped).toContain('```mermaid');
    expect(roundTripped).toContain('A-->B');
  });

  it('should preserve visible text for unpaired special characters', () => {
    const bashrc = markdownToHtml(htmlToMarkdown('<p>~/.bashrc</p>'));
    expect(bashrc).toContain('~/.bashrc');
    expect(bashrc).not.toContain('<sub>');

    const eq = markdownToHtml(htmlToMarkdown('<p>x = y</p>'));
    expect(eq).toContain('x = y');
    expect(eq).not.toContain('<mark>');
  });

  it('should not double-escape a leading == run into a visible backslash', () => {
    const html = markdownToHtml(htmlToMarkdown('<p>==foo== rest</p>'));
    expect(html).toContain('==foo== rest');
    expect(html).not.toContain('\\==');
    expect(html).not.toContain('<mark>');
  });

  it('should not double-escape a leading ~~~ run into a visible backslash', () => {
    const html = markdownToHtml(htmlToMarkdown('<p>~~~foo</p>'));
    expect(html).toContain('~~~foo');
    expect(html).not.toContain('\\~');
    expect(html).not.toContain('<sub>');
    expect(html).not.toContain('<s>');
  });
});

const EDITOR_TABLE_HTML =
  '<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody>' +
  '<tr><th colspan="1" rowspan="1"><p>Day</p></th><th colspan="1" rowspan="1"><p>Place</p></th></tr>' +
  '<tr><td colspan="1" rowspan="1"><p>1</p></td><td colspan="1" rowspan="1"><p>Antigua</p></td></tr>' +
  '</tbody></table>';

const editorTable = (rows: string) =>
  `<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"></colgroup><tbody>${rows}</tbody></table>`;

describe('htmlToMarkdown editor-authored tables', () => {
  it('should convert a stored table, colgroup and paragraph cells included', () => {
    expect(htmlToMarkdown(EDITOR_TABLE_HTML)).toBe(
      '| Day | Place |\n| --- | --- |\n| 1 | Antigua |'
    );
  });

  it('should round-trip a stored table back into a table, not escaped text', () => {
    const html = markdownToHtml(htmlToMarkdown(EDITOR_TABLE_HTML));

    expect(html).toContain('<th>Day</th>');
    expect(html).toContain('<td>Antigua</td>');
    expect(html).not.toContain('&lt;table');
  });

  it('should convert a header-only table', () => {
    expect(
      htmlToMarkdown(
        editorTable('<tr><th colspan="1" rowspan="1"><p>Day</p></th></tr>')
      )
    ).toBe('| Day |\n| --- |');
  });

  it('should escape a pipe in cell text so it cannot forge a column', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><th colspan="1" rowspan="1"><p>A | B</p></th></tr><tr><td colspan="1" rowspan="1"><p>x | y</p></td></tr>'
      )
    );

    expect(markdown).toBe('| A \\| B |\n| --- |\n| x \\| y |');
    expect(markdownToHtml(markdown)).toContain('<td>x | y</td>');
  });

  it('should keep emphasis inside a cell', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><th colspan="1" rowspan="1"><p>Note</p></th></tr><tr><td colspan="1" rowspan="1"><p>Bring <strong>cash</strong></p></td></tr>'
      )
    );

    expect(markdown).toContain('| Bring **cash** |');
    expect(markdownToHtml(markdown)).toContain('<strong>cash</strong>');
  });

  it('should collapse a multi-paragraph cell onto the single line a row allows', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><th colspan="1" rowspan="1"><p>Day</p></th></tr>' +
          '<tr><td colspan="1" rowspan="1"><p>Antigua</p><p>then Atitlan</p></td></tr>'
      )
    );

    expect(markdown).toBe('| Day |\n| --- |\n| Antigua then Atitlan |');
    expect(markdownToHtml(markdown)).toContain('<td>Antigua then Atitlan</td>');
  });

  it('should collapse a line break inside a cell', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><th colspan="1" rowspan="1"><p>Day</p></th></tr>' +
          '<tr><td colspan="1" rowspan="1"><p>Antigua<br>then Atitlan</p></td></tr>'
      )
    );

    expect(markdown).toBe('| Day |\n| --- |\n| Antigua then Atitlan |');
  });

  it('should keep an empty cell as a column instead of dropping it', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><th colspan="1" rowspan="1"><p>Day</p></th><th colspan="1" rowspan="1"><p>Place</p></th></tr>' +
          '<tr><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p>Antigua</p></td></tr>'
      )
    );

    expect(markdown).toBe('| Day | Place |\n| --- | --- |\n|  | Antigua |');
    expect(markdownToHtml(markdown)).toContain('<td>Antigua</td>');
  });

  // GFM cannot express a merged cell, so the span is dropped — but dropping it
  // must not slide the cells after it into another column, which would change
  // what the row says without showing a change.
  it('should keep a cell under a rowspan in its own column', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><th colspan="1" rowspan="1"><p>Day</p></th><th colspan="1" rowspan="1"><p>Place</p></th></tr>' +
          '<tr><td colspan="1" rowspan="2"><p>Mon</p></td><td colspan="1" rowspan="1"><p>Antigua</p></td></tr>' +
          '<tr><td colspan="1" rowspan="1"><p>Atitlan</p></td></tr>'
      )
    );

    expect(markdown).toBe(
      '| Day | Place |\n| --- | --- |\n| Mon | Antigua |\n|  | Atitlan |'
    );
    expect(markdownToHtml(markdown)).toContain('<td>Atitlan</td>');
  });

  it('should keep a cell beside a rowspan in its own column', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><th colspan="1" rowspan="1"><p>A</p></th><th colspan="1" rowspan="1"><p>B</p></th><th colspan="1" rowspan="1"><p>C</p></th></tr>' +
          '<tr><td colspan="1" rowspan="1"><p>a1</p></td><td colspan="1" rowspan="2"><p>SPAN</p></td><td colspan="1" rowspan="1"><p>c1</p></td></tr>' +
          '<tr><td colspan="1" rowspan="1"><p>a2</p></td><td colspan="1" rowspan="1"><p>c2</p></td></tr>'
      )
    );

    expect(markdown).toBe(
      '| A | B | C |\n| --- | --- | --- |\n| a1 | SPAN | c1 |\n| a2 |  | c2 |'
    );
  });

  // HTML reads rowspan="0" as "the rest of this row group"; turndown's own
  // plugin treats it as 1, which would shift every later cell left a column.
  it('should carry a rowspan of zero to the end of its row group', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><th colspan="1" rowspan="1"><p>A</p></th><th colspan="1" rowspan="1"><p>B</p></th></tr>' +
          '<tr><td colspan="1" rowspan="0"><p>X</p></td><td colspan="1" rowspan="1"><p>b1</p></td></tr>' +
          '<tr><td colspan="1" rowspan="1"><p>b2</p></td></tr>'
      )
    );

    expect(markdown).toBe('| A | B |\n| --- | --- |\n| X | b1 |\n|  | b2 |');
  });

  it('should not let a rowspan reach past its own row group', () => {
    const markdown = htmlToMarkdown(
      '<table><tbody><tr><td colspan="1" rowspan="3"><p>S</p></td><td colspan="1" rowspan="1"><p>b1</p></td></tr></tbody>' +
        '<tfoot><tr><td colspan="1" rowspan="1"><p>f1</p></td><td colspan="1" rowspan="1"><p>f2</p></td></tr></tfoot></table>'
    );

    expect(markdown).toBe('| S | b1 |\n| --- | --- |\n| f1 | f2 |');
  });

  it('should give a multi-row thead exactly one divider, as GFM allows', () => {
    const markdown = htmlToMarkdown(
      '<table><thead><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><th><p>A2</p></th><th><p>B2</p></th></tr></thead>' +
        '<tbody><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>'
    );

    expect(markdown).toBe('| A | B |\n| --- | --- |\n| A2 | B2 |\n| 1 | 2 |');
    expect(markdownToHtml(markdown)).toContain('<td>A2</td>');
  });

  it('should keep a row whose cell spans columns as wide as the table', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><th colspan="1" rowspan="1"><p>Day</p></th><th colspan="1" rowspan="1"><p>Place</p></th></tr>' +
          '<tr><td colspan="2" rowspan="1"><p>All week</p></td></tr>' +
          '<tr><td colspan="1" rowspan="1"><p>2</p></td><td colspan="1" rowspan="1"><p>Atitlan</p></td></tr>'
      )
    );

    expect(markdown).toBe(
      '| Day | Place |\n| --- | --- |\n| All week |  |\n| 2 | Atitlan |'
    );
  });

  it('should promote the first row of a header-less table, which GFM cannot express otherwise', () => {
    const markdown = htmlToMarkdown(
      editorTable(
        '<tr><td colspan="1" rowspan="1"><p>Day</p></td></tr><tr><td colspan="1" rowspan="1"><p>1</p></td></tr>'
      )
    );

    expect(markdown).toBe('| Day |\n| --- |\n| 1 |');
    expect(markdownToHtml(markdown)).toContain('<th>Day</th>');
  });
});
