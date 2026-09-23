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

  it('should escape text that reads as an HTML entity so it stays literal', () => {
    const md = htmlToMarkdown(
      '<p>&amp;nbsp; &amp;copy; &amp;#169; AT&amp;T</p>'
    );
    expect(md).toBe('\\&nbsp; \\&copy; \\&#169; AT&T');
    expect(markdownToHtml(md)).toBe(
      '<p>&amp;nbsp; &amp;copy; &amp;#169; AT&amp;T</p>\n'
    );
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

describe('htmlToMarkdown images', () => {
  // This package cannot import storedHtml() from the API; this is its output.
  const STORED_FIGURE =
    '<figure data-image=""><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/lake.webp" alt="a lake" width="320" height="200"><figcaption>Lake Atitlán</figcaption></figure>';

  it('converts the stored figure to an image with the caption as title', () => {
    expect(htmlToMarkdown(`<p>before</p>${STORED_FIGURE}<p>after</p>`)).toBe(
      'before\n\n![a lake](https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/lake.webp "Lake Atitlán")\n\nafter'
    );
  });

  it('omits the title when the caption is empty', () => {
    expect(
      htmlToMarkdown(
        '<figure data-image=""><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp" alt="a"><figcaption></figcaption></figure>'
      )
    ).toBe(
      '![a](https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp)'
    );
  });

  it('escapes quotes in the caption and brackets in the alt', () => {
    expect(
      htmlToMarkdown(
        '<figure data-image=""><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp" alt="a [b]"><figcaption>say "hi"</figcaption></figure>'
      )
    ).toBe(
      '![a \\[b\\]](https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp "say \\"hi\\"")'
    );
  });

  it('escapes the alt and caption so markdown-it reads them back as written', () => {
    expect(
      htmlToMarkdown(
        '<figure data-image=""><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp" alt="&amp;copy; \\ `x`"><figcaption>&amp;copy; \\ "q"</figcaption></figure>'
      )
    ).toBe(
      '![\\&copy; \\\\ \\`x\\`](https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp "\\&copy; \\\\ \\"q\\"")'
    );
  });

  it.each([
    ['an entity', '&copy;'],
    ['brackets', 'a [b] c'],
    ['quotes', 'a "q" b'],
    ['backslashes', 'a\\b \\* c\\'],
    ['emphasis', '*x* _y_'],
    ['backticks', 'a ` b `c`'],
  ])('keeps %s in the alt and caption literal', (_kind, text) => {
    const attribute = text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
    const html = markdownToHtml(
      htmlToMarkdown(
        `<figure data-image=""><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp" alt="${attribute}"><figcaption>${attribute}</figcaption></figure>`
      )
    );

    expect(html).toBe(
      `<figure data-image><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp" alt="${attribute}"><figcaption>${attribute}</figcaption></figure>\n`
    );
  });

  it('round-trips the figure through markdownToHtml', () => {
    const md = htmlToMarkdown(STORED_FIGURE);
    expect(markdownToHtml(md)).toContain(
      '<img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/lake.webp" alt="a lake">'
    );
    expect(markdownToHtml(md)).toContain(
      '<figcaption>Lake Atitlán</figcaption>'
    );
  });
});

describe('htmlToMarkdown nested task lists', () => {
  // This package cannot import storedHtml() from the API; this is its output.
  const STORED_NESTED =
    '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>book</p><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>flight</p></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>hotel</p></div></li></ul></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>pack</p></div></li></ul>';

  it('indents a nested task list under its parent item', () => {
    expect(htmlToMarkdown(STORED_NESTED)).toBe(
      '- [ ] book\n  - [x] flight\n  - [ ] hotel\n- [ ] pack'
    );
  });

  it('keeps a second paragraph of a task item as a continuation, not a sibling', () => {
    const md = htmlToMarkdown(
      '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>book</p><p>ask about the window seat</p></div></li></ul>'
    );
    expect(md).toBe('- [ ] book\n  \n  ask about the window seat');
    expect(markdownToHtml(md)).toContain('<p>ask about the window seat</p>');
    expect(markdownToHtml(md).match(/data-type="taskItem"/g)).toHaveLength(1);
  });

  it('keeps a blank line inside a code block of a task item', () => {
    const md = htmlToMarkdown(
      '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>fix</p><pre><code>a\n\n- b</code></pre></div></li></ul>'
    );
    expect(md).toBe('- [ ] fix\n  \n  ```\n  a\n  \n  - b\n  ```');
    expect(markdownToHtml(md)).toContain('<pre><code>a\n\n- b');
  });

  it('writes a task item with no text as a bare checkbox', () => {
    const item = (body: string) =>
      `<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div>${body}</div></li></ul>`;

    expect(htmlToMarkdown(item('<p></p>'))).toBe('- [ ]');
    expect(
      htmlToMarkdown(
        item(
          '<p></p><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>b</p></div></li></ul>'
        )
      )
    ).toBe('- [ ]\n  - [x] b');
    expect(htmlToMarkdown(item('<p></p><p>later</p>'))).toBe(
      '- [ ]\n  \n  later'
    );
  });

  it('is a fixed point for the nested list', () => {
    const once = htmlToMarkdown(STORED_NESTED);
    expect(htmlToMarkdown(markdownToHtml(once))).toBe(once);
  });
});

describe('htmlToMarkdown empty blocks', () => {
  it('writes each empty paragraph as a line holding only a non-breaking space', () => {
    expect(htmlToMarkdown('<p></p><p>a</p><p></p><p></p><p>b</p>')).toBe(
      '&nbsp;\n\na\n\n&nbsp;\n\n&nbsp;\n\nb'
    );
    expect(htmlToMarkdown('<p>a</p><blockquote><p></p></blockquote>')).toBe(
      'a\n\n> &nbsp;'
    );
  });

  it('writes the empty paragraph a list item opens with only when text follows it', () => {
    expect(
      htmlToMarkdown('<ul><li><p></p><ul><li><p>b</p></li></ul></li></ul>')
    ).toBe('-   -   b');
    expect(htmlToMarkdown('<ul><li><p></p><p>a</p></li></ul>')).toBe(
      '-   &nbsp;\n    \n    a'
    );
  });

  it('writes an empty heading as its bare marker', () => {
    expect(htmlToMarkdown('<h1></h1><p>a</p><h3></h3>')).toBe('#\n\na\n\n###');
    expect(markdownToHtml('#\n\na\n\n###')).toBe(
      '<h1></h1>\n<p>a</p>\n<h3></h3>\n'
    );
  });
});

describe('htmlToMarkdown non-breaking spaces', () => {
  it('writes a non-breaking space that opens or ends a text as &nbsp;, which Markdown would trim', () => {
    expect(htmlToMarkdown('<p>\u00a0a\u00a0</p>')).toBe('&nbsp;a&nbsp;');
    expect(htmlToMarkdown('<p>a\u00a0\u00a0</p><p>b</p>')).toBe(
      'a&nbsp;&nbsp;\n\nb'
    );
    expect(htmlToMarkdown('<h2>\u00a0a\u00a0</h2>')).toBe('## &nbsp;a&nbsp;');
    expect(htmlToMarkdown('<h2>\u00a0</h2>')).toBe('## &nbsp;');
  });

  it('leaves a non-breaking space between words as it is', () => {
    expect(htmlToMarkdown('<p>a\u00a0b</p>')).toBe('a\u00a0b');
  });

  it('keeps a cell holding only a non-breaking space', () => {
    expect(
      htmlToMarkdown(
        editorTable(
          '<tr><th colspan="1" rowspan="1"><p>h</p></th></tr>' +
            '<tr><td colspan="1" rowspan="1"><p>\u00a0</p></td></tr>'
        )
      )
    ).toBe('| h |\n| --- |\n| &nbsp; |');
  });

  it('keeps a non-breaking space that opens a caption', () => {
    expect(
      htmlToMarkdown(
        '<figure data-image=""><img src="https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp" alt="a"><figcaption>\u00a0cap\u00a0</figcaption></figure>'
      )
    ).toBe(
      '![a](https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/a.webp "\u00a0cap\u00a0")'
    );
  });
});

describe('htmlToMarkdown line breaks', () => {
  it('writes a line break as a backslash, so a line of nothing but a break stays in its paragraph', () => {
    expect(htmlToMarkdown('<p>a<br><br>b</p>')).toBe('a\\\n\\\nb');
  });

  it('writes a line of only &nbsp; below a break that ends a paragraph', () => {
    expect(htmlToMarkdown('<p><br></p>')).toBe('\\\n&nbsp;');
    expect(htmlToMarkdown('<p>a<br></p>')).toBe('a\\\n&nbsp;');
    expect(htmlToMarkdown('<p><br>a</p>')).toBe('\\\na');
  });

  it('writes a break in a heading or a cell, which hold one line, as a plain line end', () => {
    expect(htmlToMarkdown('<h2>a<br>b</h2>')).toBe('## a\nb');
    expect(
      htmlToMarkdown(
        editorTable('<tr><th colspan="1" rowspan="1"><p>a<br></p></th></tr>')
      )
    ).toBe('| a |\n| --- |');
  });
});

describe('htmlToMarkdown list items', () => {
  it('keeps an empty item as a bare marker', () => {
    expect(htmlToMarkdown('<ul><li><p>a</p></li><li><p></p></li></ul>')).toBe(
      '-   a\n    \n-'
    );
  });
});

describe('htmlToMarkdown code blocks', () => {
  it('writes the code verbatim, its own last newline included', () => {
    expect(htmlToMarkdown('<pre><code>x</code></pre>')).toBe('```\nx\n```');
    expect(
      htmlToMarkdown('<pre><code class="language-ts">x\n</code></pre>')
    ).toBe('```ts\nx\n\n```');
  });

  it('keeps a code block with no code', () => {
    expect(htmlToMarkdown('<pre><code></code></pre>')).toBe('```\n\n```');
    expect(markdownToHtml('```\n\n```')).toBe('<pre><code></code></pre>\n');
  });

  it('opens a longer fence than any run of backticks that starts a line of the code', () => {
    expect(htmlToMarkdown('<pre><code>```\nx\n  ````</code></pre>')).toBe(
      '`````\n```\nx\n  ````\n`````'
    );
  });
});

describe('htmlToMarkdown mermaid', () => {
  it('does not grow a blank line when the stored code ends with a newline', () => {
    const md = htmlToMarkdown(
      '<div data-code="graph TD\nA--&gt;B\n" data-view-mode="split" data-mermaid-block=""></div>'
    );
    expect(md).toBe('```mermaid\ngraph TD\nA-->B\n```');
  });

  it('settles code that ends with blank lines in one pass', () => {
    const once = htmlToMarkdown(
      '<div data-code="graph TD\nA--&gt;B\n\n" data-view-mode="split" data-mermaid-block=""></div>'
    );
    expect(once).toBe('```mermaid\ngraph TD\nA-->B\n```');
    expect(htmlToMarkdown(markdownToHtml(once))).toBe(once);
  });

  it('keeps a diagram that is all its container holds', () => {
    expect(
      htmlToMarkdown(
        '<blockquote><div data-code="graph TD" data-view-mode="split" data-mermaid-block=""></div></blockquote>'
      )
    ).toBe('> ```mermaid\n> graph TD\n> ```');
  });

  it('is a fixed point whether the code came from the editor or from Markdown', () => {
    const fromEditor =
      '<div data-code="graph TD\nA--&gt;B" data-view-mode="split" data-mermaid-block=""></div>';
    const fromMarkdown =
      '<div data-code="graph TD\nA--&gt;B\n" data-view-mode="split" data-mermaid-block=""></div>';
    const once = htmlToMarkdown(fromEditor);
    expect(htmlToMarkdown(fromMarkdown)).toBe(once);
    expect(htmlToMarkdown(markdownToHtml(once))).toBe(once);
  });
});
