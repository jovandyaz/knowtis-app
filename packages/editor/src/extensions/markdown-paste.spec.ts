import { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createSemanticExtensions,
  IMAGE_NODE_NAME,
  MERMAID_BLOCK_NAME,
} from '@knowtis/editor-schema';

import { MarkdownPaste } from './markdown-paste';

let editor: Editor;

function createEditor() {
  editor = new Editor({
    extensions: [...createSemanticExtensions(), MarkdownPaste],
    content: '<p></p>',
  });
  return editor;
}

function paste(data: Record<string, string>) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => data[type] ?? '',
      types: Object.keys(data),
      files: [],
    },
  });
  editor.view.dom.dispatchEvent(event);
}

function pastePlainText(text: string) {
  paste({ 'text/plain': text });
}

function findNodes(name: string) {
  const found: ProseMirrorNode[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === name) {
      found.push(node);
    }
  });
  return found;
}

function findNode(name: string) {
  return findNodes(name)[0];
}

function markedTexts(markName: string) {
  const texts: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === markName)) {
      texts.push(node.text ?? '');
    }
  });
  return texts;
}

afterEach(() => {
  editor?.destroy();
});

describe('MarkdownPaste', () => {
  it('turns a pasted mermaid fence into a mermaid block without the closing newline', () => {
    createEditor();

    pastePlainText('# Diagram\n\n```mermaid\ngraph TD\n  A --> B\n```\n');

    const mermaid = findNode(MERMAID_BLOCK_NAME);
    expect(mermaid).toBeDefined();
    expect(mermaid?.attrs['code']).toBe('graph TD\n  A --> B');
    expect(findNode('codeBlock')).toBeUndefined();
  });

  it('keeps a pasted non-mermaid fence as a code block', () => {
    createEditor();

    pastePlainText('# Snippet\n\n```ts\nconst a = 1;\n```\n');

    const codeBlock = findNode('codeBlock');
    expect(codeBlock).toBeDefined();
    expect(codeBlock?.attrs['language']).toBe('ts');
    expect(findNode(MERMAID_BLOCK_NAME)).toBeUndefined();
  });

  it('leaves a paste that carries HTML to the native parser', () => {
    createEditor();

    paste({
      'text/plain': '# Title\n\n**bold** text',
      'text/html': '<p>native paste</p>',
    });

    expect(findNode('heading')).toBeUndefined();
    expect(editor.state.doc.textContent).toBe('native paste');
  });

  it('turns a pasted markdown image into an image node with its src and alt', () => {
    createEditor();

    pastePlainText('# Photo\n\n![alt](https://example.com/a.png)\n');

    expect(
      findNodes(IMAGE_NODE_NAME).map((node) => [
        node.attrs['src'],
        node.attrs['alt'],
      ])
    ).toEqual([['https://example.com/a.png', 'alt']]);
  });

  it('keeps a pasted task list, table and underline', () => {
    createEditor();

    pastePlainText(
      [
        '# Plan',
        '- [ ] todo\n- [x] done',
        '| h | k |\n| - | - |\n| 1 | 2 |',
        'an ++underlined++ word',
      ].join('\n\n')
    );

    expect(findNodes('taskList')).toHaveLength(1);
    expect(
      findNodes('taskItem').map((node) => [
        node.textContent,
        node.attrs['checked'],
      ])
    ).toEqual([
      ['todo', false],
      ['done', true],
    ]);
    expect(findNodes('table').map((node) => node.textContent)).toEqual([
      'hk12',
    ]);
    expect(markedTexts('underline')).toEqual(['underlined']);
  });
});
