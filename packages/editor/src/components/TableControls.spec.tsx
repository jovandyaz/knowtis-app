import { render } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import { createBaseExtensions } from '../extensions/base-extensions';
import { TableControls } from './TableControls';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let editor: Editor;

function editorWithCaretInATable() {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: createBaseExtensions({ disableHistory: true }),
    content: '<table><tbody><tr><td><p>cell</p></td></tr></tbody></table>',
  });
  editor.commands.setTextSelection(4);
  return editor;
}

function mount() {
  return render(
    <TooltipProvider>
      <TableControls editor={editor} />
    </TooltipProvider>
  );
}

afterEach(() => {
  if (editor && !editor.isDestroyed) {
    editor.destroy();
  }
});

describe('TableControls', () => {
  it('looks the table up while the caret sits inside one', () => {
    editorWithCaretInATable();

    expect(editor.isActive('table')).toBe(true);
    expect(() => mount()).not.toThrow();
  });

  it('survives an editor torn down while the caret was in a table', () => {
    editorWithCaretInATable();
    expect(editor.isActive('table')).toBe(true);

    editor.destroy();

    expect(() => mount()).not.toThrow();
  });
});
