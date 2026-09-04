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
      const item = screen.getByRole(
        tool.isActive ? 'menuitemcheckbox' : 'menuitem',
        { name: new RegExp(`^${tool.labelKey}`) }
      );
      if (tool.shortcut) {
        expect(item.textContent).toContain(tool.shortcut);
      }
    }
  });

  it('keeps the secondary tools reachable from the toolbar itself', () => {
    mount();

    for (const tool of SECONDARY_TOOLS) {
      expect(screen.getByRole('button', { name: tool.labelKey })).toBeTruthy();
    }
  });

  it('runs the tool action when a menu item is selected', async () => {
    mount();
    expect(editor.isActive('codeBlock')).toBe(false);

    await userEvent.click(
      screen.getByRole('button', { name: 'editor.toolbar.moreTools' })
    );
    await userEvent.click(
      screen.getByRole('menuitemcheckbox', {
        name: /^editor\.toolbar\.codeBlock/,
      })
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
        .getByRole('menuitem', { name: /^editor\.toolbar\.undo/ })
        .getAttribute('aria-disabled')
    ).toBe('true');
    expect(
      screen
        .getByRole('menuitem', { name: /^editor\.toolbar\.redo/ })
        .getAttribute('aria-disabled')
    ).toBe('true');
  });
});

describe('EditorToolbar active state', () => {
  it('marks a tool pressed as soon as its mark is applied', () => {
    mount();
    const bold = screen.getByRole('button', { name: 'editor.toolbar.bold' });
    expect(bold.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      editor.chain().selectAll().toggleBold().run();
    });

    expect(bold.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not describe one-shot actions as toggles', () => {
    mount();
    for (const label of [
      'editor.toolbar.horizontalRule',
      'editor.toolbar.undo',
      'editor.toolbar.redo',
    ]) {
      expect(
        screen.getByRole('button', { name: label }).hasAttribute('aria-pressed')
      ).toBe(false);
    }
  });

  it('checks the folded toggle that is active in the menu', async () => {
    mount();
    act(() => {
      editor.chain().selectAll().toggleCode().run();
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'editor.toolbar.moreTools' })
    );

    expect(
      screen
        .getByRole('menuitemcheckbox', { name: /^editor\.toolbar\.inlineCode/ })
        .getAttribute('aria-checked')
    ).toBe('true');
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: /^editor\.toolbar\.codeBlock/ })
        .getAttribute('aria-checked')
    ).toBe('false');
  });

  it('enables undo once the document has history', () => {
    mount();
    const undo = screen.getByRole('button', { name: 'editor.toolbar.undo' });
    expect((undo as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      editor.chain().insertContent(' edited').run();
    });

    expect((undo as HTMLButtonElement).disabled).toBe(false);
  });
});
