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
