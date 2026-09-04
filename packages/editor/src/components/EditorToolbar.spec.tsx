import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';

import {
  TOOLBAR_FOLD_WIDTHS,
  TOOLBAR_TOOLS,
  type ToolbarToolConfig,
} from '../editor.config';
import { EditorToolbar } from './EditorToolbar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const KEY = {
  bold: 'editor.toolbar.bold',
  bulletList: 'editor.toolbar.bulletList',
  inlineCode: 'editor.toolbar.inlineCode',
  codeBlock: 'editor.toolbar.codeBlock',
  horizontalRule: 'editor.toolbar.horizontalRule',
  undo: 'editor.toolbar.undo',
  redo: 'editor.toolbar.redo',
  moreTools: 'editor.toolbar.moreTools',
} as const;

const TOOLS = TOOLBAR_TOOLS.filter(
  (item): item is ToolbarToolConfig => !('type' in item)
);
const EARLY_TOOLS = TOOLS.filter((tool) => tool.fold === 'early');
const LATE_TOOLS = TOOLS.filter((tool) => tool.fold === 'late');

const startsWith = (prefix: string) => (name: string) =>
  name.startsWith(prefix);

let editor: Editor;

function mount(width: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 40,
    top: 0,
    left: 0,
    right: width,
    bottom: 40,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
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

async function openOverflowMenu() {
  await userEvent.click(screen.getByRole('button', { name: KEY.moreTools }));
}

afterEach(() => {
  editor?.destroy();
  vi.restoreAllMocks();
});

describe('EditorToolbar folding', () => {
  it('shows every tool in the row when the container fits the full row', () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);

    for (const tool of TOOLS) {
      expect(
        screen.getByRole('button', { name: tool.labelKey })
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('button', { name: KEY.moreTools })
    ).not.toBeInTheDocument();
  });

  it('folds the early tier first and keeps the late tier in the row', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early - 1);

    for (const tool of EARLY_TOOLS) {
      expect(
        screen.queryByRole('button', { name: tool.labelKey })
      ).not.toBeInTheDocument();
    }
    for (const tool of LATE_TOOLS) {
      expect(
        screen.getByRole('button', { name: tool.labelKey })
      ).toBeInTheDocument();
    }

    await openOverflowMenu();
    for (const tool of EARLY_TOOLS) {
      expect(
        screen.getByRole(tool.isActive ? 'menuitemcheckbox' : 'menuitem', {
          name: startsWith(tool.labelKey),
        })
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('menuitemcheckbox', {
        name: startsWith(KEY.bulletList),
      })
    ).not.toBeInTheDocument();
  });

  it('folds both tiers once the container is narrower than the folded row', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.late - 1);

    for (const tool of [...EARLY_TOOLS, ...LATE_TOOLS]) {
      expect(
        screen.queryByRole('button', { name: tool.labelKey })
      ).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: KEY.bold })).toBeInTheDocument();

    await openOverflowMenu();
    expect(
      screen.getByRole('menuitemcheckbox', { name: startsWith(KEY.bulletList) })
    ).toBeInTheDocument();
  });

  it('folds everything foldable before the first measurement', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    editor = new Editor({ extensions: [StarterKit], content: '<p>x</p>' });
    render(
      <TooltipProvider>
        <EditorToolbar editor={editor} />
      </TooltipProvider>
    );

    expect(
      screen.getByRole('button', { name: KEY.moreTools })
    ).toBeInTheDocument();
  });
});

describe('EditorToolbar overflow menu', () => {
  it('lists folded tools with their shortcuts', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.late - 1);
    await openOverflowMenu();

    for (const tool of [...EARLY_TOOLS, ...LATE_TOOLS]) {
      const item = screen.getByRole(
        tool.isActive ? 'menuitemcheckbox' : 'menuitem',
        { name: startsWith(tool.labelKey) }
      );
      if (tool.shortcut) {
        expect(item).toHaveTextContent(tool.shortcut);
      }
    }
  });

  it('runs the tool action when a menu item is selected', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early - 1);
    expect(editor.isActive('codeBlock')).toBe(false);

    await openOverflowMenu();
    await userEvent.click(
      screen.getByRole('menuitemcheckbox', { name: startsWith(KEY.codeBlock) })
    );

    expect(editor.isActive('codeBlock')).toBe(true);
  });

  it('disables undo and redo while there is nothing to revert', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early - 1);
    await openOverflowMenu();

    expect(
      screen.getByRole('menuitem', { name: startsWith(KEY.undo) })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('menuitem', { name: startsWith(KEY.redo) })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('checks the folded toggle that is active', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early - 1);
    act(() => {
      editor.chain().selectAll().toggleCode().run();
    });

    await openOverflowMenu();

    expect(
      screen.getByRole('menuitemcheckbox', { name: startsWith(KEY.inlineCode) })
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemcheckbox', { name: startsWith(KEY.codeBlock) })
    ).toHaveAttribute('aria-checked', 'false');
  });
});

describe('EditorToolbar active state', () => {
  it('marks a toggle pressed as soon as its mark is applied', () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);
    const bold = screen.getByRole('button', { name: KEY.bold });
    expect(bold).toHaveAttribute('aria-pressed', 'false');

    act(() => {
      editor.chain().selectAll().toggleBold().run();
    });

    expect(bold).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not describe one-shot actions as toggles', () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);

    for (const key of [KEY.horizontalRule, KEY.undo, KEY.redo]) {
      expect(screen.getByRole('button', { name: key })).not.toHaveAttribute(
        'aria-pressed'
      );
    }
  });

  it('enables undo once the document has history', () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);
    const undo = screen.getByRole('button', { name: KEY.undo });
    expect(undo).toBeDisabled();

    act(() => {
      editor.chain().insertContent(' edited').run();
    });

    expect(undo).toBeEnabled();
  });
});
