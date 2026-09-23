import { describe, expect, it } from 'vitest';

import { markdownToHtml } from './markdown-to-html';

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

  it('stores code without the newline the fence syntax adds, and no more', () => {
    expect(markdownToHtml('```ts\nconst x = 1;\n```')).toBe(
      '<pre><code class="language-ts">const x = 1;</code></pre>\n'
    );
    expect(markdownToHtml('```ts\nconst x = 1;\n\n```')).toBe(
      '<pre><code class="language-ts">const x = 1;\n</code></pre>\n'
    );
  });

  it('should convert inline formatting', () => {
    expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>');
    expect(markdownToHtml('*italic*')).toContain('<em>italic</em>');
    expect(markdownToHtml('`code`')).toContain('<code>code</code>');
    expect(markdownToHtml('~~strike~~')).toContain('<s>strike</s>');
  });

  it('renders ++text++ as the underline the editor parses', () => {
    expect(markdownToHtml('a ++under++ b')).toBe('<p>a <u>under</u> b</p>\n');
  });

  it('nests underline with bold, italic and a link', () => {
    expect(markdownToHtml('++**b**++ _++i++_ [++l++](https://x.test)')).toBe(
      '<p><u><strong>b</strong></u> <em><u>i</u></em> <a href="https://x.test"><u>l</u></a></p>\n'
    );
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

  it('reads a paragraph of nothing but spaces as an empty one', () => {
    expect(markdownToHtml('a\n\n&nbsp;\n\n&nbsp; &nbsp;\n\nb')).toBe(
      '<p>a</p>\n<p></p>\n<p></p>\n<p>b</p>\n'
    );
  });

  it('keeps a non-breaking space that opens or ends a paragraph, a task or a cell', () => {
    expect(markdownToHtml('&nbsp;a&nbsp;')).toBe('<p>\u00a0a\u00a0</p>\n');
    expect(markdownToHtml('- &nbsp;a')).toBe('<ul>\n<li>\u00a0a</li>\n</ul>\n');
    expect(markdownToHtml('- [ ] &nbsp;a&nbsp;')).toBe(
      '<ul data-type="taskList">\n<li data-type="taskItem" data-checked="false"><div><p>\u00a0a\u00a0</p></div></li>\n</ul>\n'
    );
    expect(markdownToHtml('| h |\n| --- |\n| &nbsp; |')).toContain(
      '<td>\u00a0</td>'
    );
  });

  it('reads a line of only &nbsp; below a break that ends a paragraph as nothing', () => {
    expect(markdownToHtml('\\\n&nbsp;')).toBe('<p><br>\n</p>\n');
    expect(markdownToHtml('a\\\n&nbsp;')).toBe('<p>a<br>\n</p>\n');
    expect(markdownToHtml('a\\\n\\\n&nbsp;')).toBe('<p>a<br>\n<br>\n</p>\n');
    expect(markdownToHtml('- [ ] a\\\n  &nbsp;')).toBe(
      '<ul data-type="taskList">\n<li data-type="taskItem" data-checked="false"><div><p>a<br></p></div></li>\n</ul>\n'
    );
  });

  it('keeps a non-breaking space that pads no break', () => {
    expect(markdownToHtml('a\\\n&nbsp;b')).toBe('<p>a<br>\n\u00a0b</p>\n');
    expect(markdownToHtml('&nbsp;\\\na')).toBe('<p>\u00a0<br>\na</p>\n');
    expect(markdownToHtml('&nbsp;**a**')).toBe(
      '<p>\u00a0<strong>a</strong></p>\n'
    );
    expect(markdownToHtml('**a**&nbsp;')).toBe(
      '<p><strong>a</strong>\u00a0</p>\n'
    );
  });

  it('keeps the text of a paragraph that also holds a non-breaking space', () => {
    expect(markdownToHtml('a &nbsp;b')).toBe('<p>a \u00a0b</p>\n');
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
      '<li data-type="taskItem" data-checked="false"><div><p>todo</p></div></li>'
    );
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="true"><div><p>done</p></div></li>'
    );
  });

  it('keeps a nested task item taggable and ticked', () => {
    const result = markdownToHtml('- [ ] parent\n  - [x] child\n- [x] other');

    expect(result).toContain(
      '<li data-type="taskItem" data-checked="false"><div><p>parent</p>'
    );
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="true"><div><p>child</p></div></li>'
    );
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="true"><div><p>other</p></div></li>'
    );
    expect(result).not.toContain('task-list-item');
    expect(result).not.toContain('</label>');
    expect(result).not.toContain('<p></p>');
  });

  it('keeps every checkbox of a loose task list', () => {
    const result = markdownToHtml('- [ ] buy milk\n\n- [x] call mom');

    expect(result).toContain(
      '<li data-type="taskItem" data-checked="false"><div><p>buy milk</p>'
    );
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="true"><div><p>call mom</p>'
    );
    expect(result).not.toContain('task-list-item');
    expect(result).not.toContain('</label>');
    expect(result).not.toContain('<input');
    expect(result).not.toContain('<p></p>');
  });

  it('keeps the siblings ticked when one continuation paragraph loosens the list', () => {
    const result = markdownToHtml(
      '- [x] passport\n- [ ] visa\n\n  needs photo\n- [x] tickets'
    );

    expect(result).toContain(
      '<li data-type="taskItem" data-checked="true"><div><p>passport</p>'
    );
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="false"><div><p>visa</p>'
    );
    expect(result).toContain('<p>needs photo</p>');
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="true"><div><p>tickets</p>'
    );
    expect(result).not.toContain('task-list-item');
    expect(result).not.toContain('</label>');
  });

  it('keeps a plain sublist under a task item, tight or loose', () => {
    const tight = markdownToHtml(
      '- [x] groceries\n  - milk\n  - eggs\n- [ ] laundry'
    );
    const loose = markdownToHtml(
      '- [x] groceries\n\n  - milk\n  - eggs\n- [ ] laundry'
    );

    for (const result of [tight, loose]) {
      expect(result).toContain(
        '<li data-type="taskItem" data-checked="true"><div><p>groceries</p>'
      );
      expect(result).toContain('<li>milk</li>');
      expect(result).toContain(
        '<li data-type="taskItem" data-checked="false"><div><p>laundry</p>'
      );
      expect(result).not.toContain('task-list-item');
      expect(result).not.toContain('</label>');
      expect(result).not.toContain('<p></p>');
    }
  });

  it('keeps a nested task list under a loose parent item', () => {
    const result = markdownToHtml('- [ ] parent\n\n  - [x] child\n- [x] other');

    expect(result).toContain(
      '<li data-type="taskItem" data-checked="false"><div><p>parent</p>'
    );
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="true"><div><p>child</p></div></li>'
    );
    expect(result).toContain(
      '<li data-type="taskItem" data-checked="true"><div><p>other</p>'
    );
    expect(result).not.toContain('task-list-item');
    expect(result).not.toContain('</label>');
    expect(result).not.toContain('<p></p>');
  });

  it('wraps a task item in the div the editor reads its content from', () => {
    expect(
      markdownToHtml('- [ ] draw it\n\n  ```mermaid\n  flowchart LR\n  ```')
    ).toBe(
      '<ul data-type="taskList">\n<li data-type="taskItem" data-checked="false"><div><p>draw it</p>\n<div data-mermaid-block data-code="flowchart LR"></div></div></li>\n</ul>\n'
    );
  });

  it('closes the wrapper of each nested task item before its own item', () => {
    expect(markdownToHtml('- [ ] a\n  - [x] b\n- [ ] c')).toBe(
      '<ul data-type="taskList">\n' +
        '<li data-type="taskItem" data-checked="false"><div><p>a</p>\n' +
        '<ul data-type="taskList">\n' +
        '<li data-type="taskItem" data-checked="true"><div><p>b</p></div></li>\n' +
        '</ul>\n' +
        '</div></li>\n' +
        '<li data-type="taskItem" data-checked="false"><div><p>c</p></div></li>\n' +
        '</ul>\n'
    );
  });

  it('leaves a plain list item under a task item unwrapped', () => {
    expect(markdownToHtml('- [ ] a\n  - b')).toBe(
      '<ul data-type="taskList">\n' +
        '<li data-type="taskItem" data-checked="false"><div><p>a</p>\n' +
        '<ul>\n<li>b</li>\n</ul>\n' +
        '</div></li>\n' +
        '</ul>\n'
    );
  });

  it('reads a bare checkbox as a task item with no text', () => {
    expect(markdownToHtml('- [ ]\n- [x]')).toBe(
      '<ul data-type="taskList">\n' +
        '<li data-type="taskItem" data-checked="false"><div><p></p></div></li>\n' +
        '<li data-type="taskItem" data-checked="true"><div><p></p></div></li>\n' +
        '</ul>\n'
    );
  });

  it('turns a numbered task list into the task list the editor holds', () => {
    const tasks =
      '<ul data-type="taskList">\n' +
      '<li data-type="taskItem" data-checked="false"><div><p>a</p></div></li>\n' +
      '<li data-type="taskItem" data-checked="true"><div><p>b</p></div></li>\n' +
      '</ul>\n';

    expect(markdownToHtml('1. [ ] a\n2. [x] b')).toBe(tasks);
    expect(markdownToHtml('3. [ ] a\n4. [x] b')).toBe(tasks);
    expect(markdownToHtml('1. a\n2. b')).toBe(
      '<ol>\n<li>a</li>\n<li>b</li>\n</ol>\n'
    );
  });

  it('splits a list that mixes task and plain items into runs of one kind', () => {
    const task = (text: string, checked = false) =>
      '<ul data-type="taskList">\n' +
      `<li data-type="taskItem" data-checked="${checked}"><div><p>${text}</p></div></li>\n` +
      '</ul>\n';

    expect(markdownToHtml('- a\n- [ ] b')).toBe(
      `<ul>\n<li>a</li>\n</ul>\n${task('b')}`
    );
    expect(markdownToHtml('- [ ] a\n- b\n- [x] c')).toBe(
      `${task('a')}<ul>\n<li>b</li>\n</ul>\n${task('c', true)}`
    );
    expect(markdownToHtml('1. a\n2. [ ] b')).toBe(
      `<ol>\n<li>a</li>\n</ol>\n${task('b')}`
    );
    expect(markdownToHtml('3. a\n4. [x] b\n5. c')).toBe(
      `<ol start="3">\n<li>a</li>\n</ol>\n${task('b', true)}<ol start="5">\n<li>c</li>\n</ol>\n`
    );
  });

  it('leaves escaped brackets and a reference link alone', () => {
    expect(markdownToHtml('- \\[ \\]')).toBe('<ul>\n<li>[ ]</li>\n</ul>\n');
    expect(markdownToHtml('- [x]\n\n[x]: https://example.com')).toBe(
      '<ul>\n<li><a href="https://example.com">x</a></li>\n</ul>\n'
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

  it('stores mermaid code without the trailing newline the fence syntax adds', () => {
    expect(markdownToHtml('```mermaid\ngraph TD\nA-->B\n```')).toBe(
      '<div data-mermaid-block data-code="graph TD\nA--&gt;B"></div>'
    );
  });

  it('stores mermaid code without the blank lines that end its fence', () => {
    expect(markdownToHtml('```mermaid\ngraph TD\n\n\n```')).toBe(
      '<div data-mermaid-block data-code="graph TD"></div>'
    );
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

  describe('images', () => {
    const SRC =
      'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/lake.webp';

    it('renders a lone image as the editor figure, with no paragraph around it', () => {
      expect(markdownToHtml(`![a lake](${SRC} "Lake Atitlán")`)).toBe(
        `<figure data-image><img src="${SRC}" alt="a lake"><figcaption>Lake Atitlán</figcaption></figure>\n`
      );
    });

    it('keeps a lone image inside its list item, under the paragraph the item opens with', () => {
      const figure = `<figure data-image><img src="${SRC}" alt="a"><figcaption></figcaption></figure>`;

      expect(markdownToHtml(`- ![a](${SRC})`)).toBe(
        `<ul>\n<li><p></p>${figure}</li>\n</ul>\n`
      );
      expect(markdownToHtml(`1. ![a](${SRC})`)).toBe(
        `<ol>\n<li><p></p>${figure}</li>\n</ol>\n`
      );
      expect(markdownToHtml(`- [ ] ![a](${SRC})`)).toBe(
        `<ul data-type="taskList">\n<li data-type="taskItem" data-checked="false"><div><p></p>${figure}</div></li>\n</ul>\n`
      );
    });

    it('opens with an empty paragraph a list item whose first block is not one', () => {
      const figure = `<figure data-image><img src="${SRC}" alt="a"><figcaption></figcaption></figure>`;

      expect(markdownToHtml(`- ![a](${SRC}) caption`)).toBe(
        `<ul>\n<li><p></p>${figure}caption</li>\n</ul>\n`
      );
      expect(markdownToHtml('- - b')).toBe(
        '<ul>\n<li>\n<p></p><ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n'
      );
      expect(markdownToHtml('- a\n-')).toBe(
        '<ul>\n<li>a</li>\n<li><p></p></li>\n</ul>\n'
      );
    });

    it('adds no empty paragraph above an image that follows the item text', () => {
      expect(markdownToHtml(`- text\n\n  ![a](${SRC})`)).toBe(
        `<ul>\n<li>\n<p>text</p>\n<figure data-image><img src="${SRC}" alt="a"><figcaption></figcaption></figure>\n</li>\n</ul>\n`
      );
    });

    it('leaves the caption empty when the image has no title', () => {
      expect(markdownToHtml(`![a lake](${SRC})`)).toContain(
        '<figcaption></figcaption>'
      );
    });

    it('reads the alt as written, with its escapes and entities resolved', () => {
      expect(
        markdownToHtml(`![a \\[b\\] &copy; \\\\ *x* \\\`y\\\`](${SRC})`)
      ).toBe(
        `<figure data-image><img src="${SRC}" alt="a [b] © \\ *x* \`y\`"><figcaption></figcaption></figure>\n`
      );
    });

    it('escapes markup in alt and caption', () => {
      const html = markdownToHtml(`![<b>x</b>](${SRC} "<i>y</i>")`);
      expect(html).toContain('alt="&lt;b&gt;x&lt;/b&gt;"');
      expect(html).toContain('<figcaption>&lt;i&gt;y&lt;/i&gt;</figcaption>');
      expect(html).not.toContain('<b>');
    });

    it('splits the paragraph around an image, which the editor holds as a block', () => {
      const figure = `<figure data-image><img src="${SRC}" alt="map"><figcaption></figcaption></figure>`;

      expect(markdownToHtml(`See ![map](${SRC}) here.`)).toBe(
        `<p>See</p>\n${figure}\n<p>here.</p>\n`
      );
      expect(markdownToHtml(`![map](${SRC}) here`)).toBe(
        `${figure}\n<p>here</p>\n`
      );
      expect(markdownToHtml(`See\n![map](${SRC})\nhere`)).toBe(
        `<p>See</p>\n${figure}\n<p>here</p>\n`
      );
    });

    it('leaves an image inside emphasis in place, so the mark stays balanced', () => {
      expect(markdownToHtml(`*see ![a](${SRC})* here`)).toBe(
        `<p><em>see <figure data-image><img src="${SRC}" alt="a"><figcaption></figcaption></figure></em> here</p>\n`
      );
    });

    it('keeps a task item label apart from the image written after it', () => {
      const figure = `<figure data-image><img src="${SRC}" alt="a"><figcaption></figcaption></figure>`;

      expect(markdownToHtml(`- [ ] see ![a](${SRC}) caption`)).toBe(
        `<ul data-type="taskList">\n<li data-type="taskItem" data-checked="false"><div><p>see</p>${figure}caption</div></li>\n</ul>\n`
      );
    });
  });
});
