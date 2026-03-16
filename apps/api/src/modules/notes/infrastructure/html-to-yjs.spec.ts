import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import * as Y from 'yjs';

import { editorSchema, htmlToYjsState } from './html-to-yjs';

function decodeState(state: Buffer) {
  const yDoc = new Y.Doc();
  Y.applyUpdate(yDoc, state);
  const node = yXmlFragmentToProseMirrorRootNode(
    yDoc.getXmlFragment('content'),
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
});
