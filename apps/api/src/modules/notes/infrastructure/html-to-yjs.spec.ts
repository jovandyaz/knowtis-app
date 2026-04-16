import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import * as Y from 'yjs';

import { YJS_XML_FRAGMENT_NAME } from '@knowtis/editor-schema';

import { editorSchema, htmlToYjsState } from './html-to-yjs';

function decodeState(state: Buffer) {
  const yDoc = new Y.Doc();
  Y.applyUpdate(yDoc, state);
  const node = yXmlFragmentToProseMirrorRootNode(
    yDoc.getXmlFragment(YJS_XML_FRAGMENT_NAME),
    editorSchema
  );
  yDoc.destroy();
  return node.toJSON();
}

describe('htmlToYjsState', () => {
  it('should preserve link href and text', () => {
    const html =
      '<p>Visit <a href="https://example.com" target="_blank" rel="noopener noreferrer">Example</a></p>';
    const json = decodeState(htmlToYjsState(html));

    const paragraph = json.content[0];
    expect(paragraph.type).toBe('paragraph');

    const linkNode = paragraph.content?.find(
      (n: { marks?: { type: string }[] }) =>
        n.marks?.some((m) => m.type === 'link')
    );
    expect(linkNode).toBeDefined();
    expect(linkNode.text).toBe('Example');

    const linkMark = linkNode.marks.find(
      (m: { type: string }) => m.type === 'link'
    );
    expect(linkMark.attrs.href).toBe('https://example.com');
  });

  it('should convert code block with text content', () => {
    const html = '<pre><code>const x = 1;</code></pre>';
    const json = decodeState(htmlToYjsState(html));

    const codeBlock = json.content[0];
    expect(codeBlock.type).toBe('codeBlock');
    expect(codeBlock.content[0].text).toBe('const x = 1;');
  });

  it('should preserve code block language attribute', () => {
    const html =
      '<pre><code class="language-javascript">const x = 1;</code></pre>';
    const json = decodeState(htmlToYjsState(html));

    const codeBlock = json.content[0];
    expect(codeBlock.type).toBe('codeBlock');
    expect(codeBlock.attrs.language).toBe('javascript');
    expect(codeBlock.content[0].text).toBe('const x = 1;');
  });

  it('should preserve bold mark on text', () => {
    const html = '<p>Hello <strong>world</strong></p>';
    const json = decodeState(htmlToYjsState(html));

    const paragraph = json.content[0];
    expect(paragraph.type).toBe('paragraph');
    expect(paragraph.content[0].text).toBe('Hello ');

    const boldNode = paragraph.content[1];
    expect(boldNode.text).toBe('world');
    expect(boldNode.marks).toContainEqual(
      expect.objectContaining({ type: 'bold' })
    );
  });

  it('should preserve table structure with header and body rows', () => {
    const html =
      '<table><tbody><tr><th>Name</th><th>Age</th></tr><tr><td>Ada</td><td>36</td></tr></tbody></table>';
    const json = decodeState(htmlToYjsState(html));

    const table = json.content[0];
    expect(table.type).toBe('table');
    expect(table.content).toHaveLength(2);

    const [headerRow, bodyRow] = table.content;
    expect(headerRow.type).toBe('tableRow');
    expect(headerRow.content[0].type).toBe('tableHeader');
    expect(bodyRow.content[0].type).toBe('tableCell');
  });

  it('should preserve task list with checked state', () => {
    const html =
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li><li data-type="taskItem" data-checked="false"><p>Todo</p></li></ul>';
    const json = decodeState(htmlToYjsState(html));

    const taskList = json.content[0];
    expect(taskList.type).toBe('taskList');
    expect(taskList.content).toHaveLength(2);
    expect(taskList.content[0].attrs.checked).toBe(true);
    expect(taskList.content[1].attrs.checked).toBe(false);
  });

  it('should preserve highlight mark with color attribute', () => {
    const html =
      '<p>Normal <mark data-color="#fef08a" style="background-color: #fef08a">highlighted</mark> text</p>';
    const json = decodeState(htmlToYjsState(html));

    const paragraph = json.content[0];
    const markedNode = paragraph.content.find(
      (n: { marks?: { type: string }[] }) =>
        n.marks?.some((m) => m.type === 'highlight')
    );
    expect(markedNode).toBeDefined();
    expect(markedNode.text).toBe('highlighted');
  });

  it('should preserve superscript and subscript marks', () => {
    const superHtml = '<p>x<sup>2</sup></p>';
    const superJson = decodeState(htmlToYjsState(superHtml));
    const superNode = superJson.content[0].content[1];
    expect(superNode.marks).toContainEqual(
      expect.objectContaining({ type: 'superscript' })
    );

    const subHtml = '<p>H<sub>2</sub>O</p>';
    const subJson = decodeState(htmlToYjsState(subHtml));
    const subNode = subJson.content[0].content[1];
    expect(subNode.marks).toContainEqual(
      expect.objectContaining({ type: 'subscript' })
    );
  });

  it('should preserve mermaidBlock node with code attribute', () => {
    const html =
      '<div data-mermaid-block data-code="graph TD&#10;  A --&gt; B"></div>';
    const json = decodeState(htmlToYjsState(html));

    const mermaidNode = json.content[0];
    expect(mermaidNode.type).toBe('mermaidBlock');
    expect(mermaidNode.attrs.code).toContain('graph TD');
    expect(mermaidNode.attrs.code).toContain('A --> B');
  });

  it('should preserve mermaidBlock viewMode attribute across modes', () => {
    const cases: Array<'code' | 'preview' | 'split'> = [
      'code',
      'preview',
      'split',
    ];

    for (const mode of cases) {
      const html = `<div data-mermaid-block data-code="graph TD" data-view-mode="${mode}"></div>`;
      const json = decodeState(htmlToYjsState(html));

      const mermaidNode = json.content[0];
      expect(mermaidNode.type).toBe('mermaidBlock');
      expect(mermaidNode.attrs.viewMode).toBe(mode);
      expect(mermaidNode.attrs.code).toBe('graph TD');
    }
  });

  it('should fall back to default viewMode when data-view-mode is missing', () => {
    const html = '<div data-mermaid-block data-code="graph TD"></div>';
    const json = decodeState(htmlToYjsState(html));

    const mermaidNode = json.content[0];
    expect(mermaidNode.type).toBe('mermaidBlock');
    expect(mermaidNode.attrs.viewMode).toBe('split');
  });

  it('should fall back to default viewMode when data-view-mode is invalid', () => {
    const html =
      '<div data-mermaid-block data-code="graph TD" data-view-mode="foo"></div>';
    const json = decodeState(htmlToYjsState(html));

    const mermaidNode = json.content[0];
    expect(mermaidNode.type).toBe('mermaidBlock');
    expect(mermaidNode.attrs.viewMode).toBe('split');
  });
});
