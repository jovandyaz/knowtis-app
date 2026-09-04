import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import { TOOLBAR_TOOLS, type ToolbarToolConfig } from '../editor.config';
import { EditorToolbar } from './EditorToolbar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const SECONDARY_TOOLS = TOOLBAR_TOOLS.filter(
  (item): item is ToolbarToolConfig => !('type' in item) && !!item.secondary
);

let editor: Editor;

function mount() {
  editor = new Editor({
    extensions: [StarterKit],
    content: '<p>hello</p>',
  });
  render(
    <TooltipProvider>
      <EditorToolbar editor={editor} />
    </TooltipProvider>
  );
}

afterEach(() => {
  editor?.destroy();
});

describe('EditorToolbar overflow menu', () => {
  it('lists every secondary tool with its shortcut', async () => {
    mount();

    await userEvent.click(
      screen.getByRole('button', { name: 'editor.toolbar.moreTools' })
    );

    expect(SECONDARY_TOOLS.length).toBeGreaterThan(0);
    for (const tool of SECONDARY_TOOLS) {
      const item = screen.getByRole('menuitem', {
        name: new RegExp(`^${tool.label}`),
      });
      if (tool.shortcut) {
        expect(item.textContent).toContain(tool.shortcut);
      }
    }
  });

  it('keeps the secondary tools reachable from the toolbar itself', () => {
    mount();

    for (const tool of SECONDARY_TOOLS) {
      expect(screen.getByRole('button', { name: tool.label })).toBeTruthy();
    }
  });

  it('runs the tool action when a menu item is selected', async () => {
    mount();
    expect(editor.isActive('codeBlock')).toBe(false);

    await userEvent.click(
      screen.getByRole('button', { name: 'editor.toolbar.moreTools' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: /^Code Block/ })
    );

    expect(editor.isActive('codeBlock')).toBe(true);
  });

  it('disables undo and redo while there is nothing to revert', async () => {
    mount();

    await userEvent.click(
      screen.getByRole('button', { name: 'editor.toolbar.moreTools' })
    );

    expect(
      screen
        .getByRole('menuitem', { name: /^Undo/ })
        .getAttribute('aria-disabled')
    ).toBe('true');
    expect(
      screen
        .getByRole('menuitem', { name: /^Redo/ })
        .getAttribute('aria-disabled')
    ).toBe('true');
  });
});

describe('EditorToolbar active state', () => {
  const ACTIVE_CLASS = 'bg-foreground';

  it('marks a tool active as soon as its mark is applied', () => {
    mount();
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold.className).not.toContain(ACTIVE_CLASS);

    act(() => {
      editor.chain().selectAll().toggleBold().run();
    });

    expect(bold.className).toContain(ACTIVE_CLASS);
  });

  it('enables undo once the document has history', () => {
    mount();
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect((undo as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      editor.chain().insertContent(' edited').run();
    });

    expect((undo as HTMLButtonElement).disabled).toBe(false);
  });
});
