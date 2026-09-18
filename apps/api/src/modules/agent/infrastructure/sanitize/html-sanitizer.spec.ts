import { describe, expect, it } from 'vitest';
import { yDocToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { htmlToYjsState } from '../../../notes/infrastructure/html-to-yjs';
import {
  htmlToPlainText,
  markdownToNoteHtml,
  markdownToPreviewHtml,
} from './html-sanitizer';

interface PMJson {
  readonly type: string;
  readonly attrs?: Record<string, unknown>;
  readonly marks?: readonly { readonly type: string }[];
  readonly content?: readonly PMJson[];
}

const EDITOR_VOCABULARY_MARKDOWN = [
  '# Trip',
  '',
  'Fly to [Guatemala](https://example.com/gt) with **cash**.',
  '',
  '| City | Days |',
  '| --- | --- |',
  '| Antigua | 2 |',
  '',
  '- [x] passport',
  '- [ ] visa',
  '  - [x] photo',
  '',
  'Bring ==sunscreen== and H~2~O for the 30^th^.',
  '',
  '```mermaid',
  'flowchart LR',
  '  A --> B',
  '```',
].join('\n');

const LOOSE_TASK_LIST_MARKDOWN = [
  '- [x] passport',
  '- [ ] visa',
  '',
  '  needs photo',
  '- [x] tickets',
].join('\n');

function persistedDocument(html: string): PMJson {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, htmlToYjsState(html));
  const json = yDocToProsemirrorJSON(doc, YJS_XML_FRAGMENT_NAME) as PMJson;
  doc.destroy();
  return json;
}

function collectTypes(node: PMJson, into = new Set<string>()): Set<string> {
  into.add(node.type);
  for (const mark of node.marks ?? []) {
    into.add(mark.type);
  }
  for (const child of node.content ?? []) {
    collectTypes(child, into);
  }
  return into;
}

function collectNodes(
  node: PMJson,
  type: string,
  into: PMJson[] = []
): PMJson[] {
  if (node.type === type) {
    into.push(node);
  }
  for (const child of node.content ?? []) {
    collectNodes(child, type, into);
  }
  return into;
}

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

  it('leaves a mermaid fence readable in the chat preview, which cannot draw it', () => {
    const preview = markdownToPreviewHtml(
      '```mermaid\nflowchart LR\n  A --> B\n```'
    );
    expect(preview).not.toContain('data-mermaid-block');
    expect(preview).toContain('class="language-mermaid"');
    expect(preview).toContain('flowchart LR');
  });

  it('survives the editor persistence round-trip as a mermaidBlock node', () => {
    const html = markdownToNoteHtml('```mermaid\nflowchart LR\n  A --> B\n```');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, htmlToYjsState(html));
    const json = yDocToProsemirrorJSON(doc, YJS_XML_FRAGMENT_NAME) as {
      content: Array<{ type: string; attrs?: { code?: string } }>;
    };
    doc.destroy();

    expect(json.content[0].type).toBe('mermaidBlock');
    expect(json.content[0].attrs?.code).toContain('A --> B');
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
    ]) {
      expect(types).toContain(expected);
    }
    expect(
      collectNodes(json, 'taskItem').map((item) => item.attrs?.['checked'])
    ).toEqual([true, false, true]);
    expect(collectNodes(json, 'taskList')).toHaveLength(2);
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
      collectNodes(json, 'taskItem').map((item) => item.attrs?.['checked'])
    ).toEqual([true, false, true]);
    expect(JSON.stringify(json)).toContain('needs photo');
  });

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

  it('drops images: the server schema has no image node yet', () => {
    const html = markdownToNoteHtml('![map](https://example.com/map.png)');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('map.png');
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
