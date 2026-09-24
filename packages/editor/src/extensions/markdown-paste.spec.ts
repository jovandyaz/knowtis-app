import { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createSemanticExtensions,
  IMAGE_NODE_NAME,
  MERMAID_BLOCK_NAME,
} from '@knowtis/editor-schema';

import {
  PENDING_IMAGE_SCHEME,
  type PastedImageOptions,
} from './image/pasted-image-html';
import { MarkdownPaste } from './markdown-paste';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TOKEN = `${PENDING_IMAGE_SCHEME}0b6c1a52-2f7e-4d0c-9d43-5d5c8f0e8a11`;

let editor: Editor;

function createEditor(options: PastedImageOptions = {}) {
  editor = new Editor({
    extensions: [
      ...createSemanticExtensions(),
      MarkdownPaste.configure(options),
    ],
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

  it('stores the hook token instead of a markdown data URI image', () => {
    const files: File[] = [];
    createEditor({
      onDataImage: (file) => {
        files.push(file);
        return TOKEN;
      },
    });

    pastePlainText(`# Shot\n\n![a](${PNG_DATA_URL})\n`);

    expect(
      findNodes(IMAGE_NODE_NAME).map((node) => [
        node.attrs['src'],
        node.attrs['alt'],
      ])
    ).toEqual([[TOKEN, 'a']]);
    expect(files.map((file) => file.type)).toEqual(['image/png']);
  });

  it('keeps a markdown data URI image out of the document without a hook', () => {
    createEditor();

    pastePlainText(`# Shot\n\n![a](${PNG_DATA_URL})\n`);

    expect(findNodes(IMAGE_NODE_NAME)).toEqual([]);
    expect(JSON.stringify(editor.getJSON())).not.toContain('data:');
    expect(editor.state.doc.textContent).toBe('Shot');
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
