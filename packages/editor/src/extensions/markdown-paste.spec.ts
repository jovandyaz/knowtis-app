import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createSemanticExtensions,
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

function pastePlainText(text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
      types: ['text/plain'],
      files: [],
    },
  });
  editor.view.dom.dispatchEvent(event);
}

function findNode(name: string) {
  let found: { attrs: Record<string, unknown> } | undefined;
  editor.state.doc.descendants((node) => {
    if (node.type.name === name && !found) {
      found = node;
    }
  });
  return found;
}

afterEach(() => {
  editor?.destroy();
});

describe('MarkdownPaste', () => {
  it('turns a pasted mermaid fence into a mermaid block node', () => {
    createEditor();

    pastePlainText('# Diagram\n\n```mermaid\ngraph TD\n  A --> B\n```\n');

    const mermaid = findNode(MERMAID_BLOCK_NAME);
    expect(mermaid).toBeDefined();
    expect(mermaid?.attrs['code']).toBe('graph TD\n  A --> B\n');
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
});
