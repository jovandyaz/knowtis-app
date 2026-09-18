import type { ComponentProps } from 'react';

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  toolbar: 'editor.toolbar.label',
  heading: 'editor.toolbar.heading',
  heading3: 'editor.toolbar.heading3',
  bold: 'editor.toolbar.bold',
  italic: 'editor.toolbar.italic',
  bulletList: 'editor.toolbar.bulletList',
  inlineCode: 'editor.toolbar.inlineCode',
  codeBlock: 'editor.toolbar.codeBlock',
  link: 'editor.toolbar.link',
  horizontalRule: 'editor.toolbar.horizontalRule',
  undo: 'editor.toolbar.undo',
  redo: 'editor.toolbar.redo',
  moreTools: 'editor.toolbar.moreTools',
  autocomplete: 'editor.toolbar.autocomplete',
  askAI: 'ai.menu.askAI',
  voiceNote: 'ai.slash.voiceNote',
} as const;

interface PlatformHints {
  mac: string;
  other: string;
}

const SHORTCUT_HINTS: Readonly<Record<string, PlatformHints>> = {
  'editor.toolbar.bold': { mac: '⌘B', other: 'Ctrl+B' },
  'editor.toolbar.italic': { mac: '⌘I', other: 'Ctrl+I' },
  'editor.toolbar.underline': { mac: '⌘U', other: 'Ctrl+U' },
  'editor.toolbar.strikethrough': { mac: '⇧⌘S', other: 'Ctrl+Shift+S' },
  'editor.toolbar.inlineCode': { mac: '⌘E', other: 'Ctrl+E' },
  'editor.toolbar.codeBlock': { mac: '⌥⌘C', other: 'Ctrl+Alt+C' },
  'editor.toolbar.superscript': { mac: '⌘.', other: 'Ctrl+.' },
  'editor.toolbar.subscript': { mac: '⌘,', other: 'Ctrl+,' },
};

const TOOLS = TOOLBAR_TOOLS.filter(
  (item): item is ToolbarToolConfig => !('type' in item)
);
const EARLY_TOOLS = TOOLS.filter((tool) => tool.fold === 'early');
const LATE_TOOLS = TOOLS.filter((tool) => tool.fold === 'late');

const startsWith = (prefix: string) => (name: string) =>
  name.startsWith(prefix);

let editor: Editor;

type ToolbarProps = Omit<ComponentProps<typeof EditorToolbar>, 'editor'>;

const TOOLBAR_HEIGHT = 40;

function boxOf(width: number): DOMRect {
  return DOMRect.fromRect({ width, height: TOOLBAR_HEIGHT });
}

function mount(width: number, props: ToolbarProps = {}) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    boxOf(width)
  );
  editor = new Editor({
    extensions: [StarterKit],
    content: '<p>hello</p>',
  });
  const toolbar = (nextProps: ToolbarProps) => (
    <TooltipProvider>
      <EditorToolbar editor={editor} {...nextProps} />
    </TooltipProvider>
  );
  const { rerender } = render(toolbar(props));
  return {
    rerender: (nextProps: ToolbarProps) => rerender(toolbar(nextProps)),
  };
}

async function openOverflowMenu() {
  await userEvent.click(screen.getByRole('button', { name: KEY.moreTools }));
}

function captureResizes() {
  const observers: ResizeObserverSpy[] = [];

  class ResizeObserverSpy implements ResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    resize(target: Element, width: number) {
      const size = { inlineSize: width, blockSize: TOOLBAR_HEIGHT };
      this.callback(
        [
          {
            target,
            borderBoxSize: [size],
            contentBoxSize: [size],
            devicePixelContentBoxSize: [size],
            contentRect: boxOf(width),
          },
        ],
        this
      );
    }
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverSpy);
  return (width: number) => {
    act(() => {
      for (const observer of observers) {
        observer.resize(getToolbar(), width);
      }
    });
  };
}

function getToolbar() {
  return screen.getByRole('toolbar', { name: KEY.toolbar });
}

function control(name: string) {
  return within(getToolbar()).getByRole('button', { name });
}

function tabStops() {
  return within(getToolbar())
    .getAllByRole('button')
    .filter((button) => button.tabIndex !== -1);
}

afterEach(() => {
  editor?.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EditorToolbar folding', () => {
  it('keeps the sticky overflow row on an opaque toolbar surface', () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);

    const capsule = getToolbar();
    expect(capsule).toHaveClass(
      'bg-background',
      'border-border',
      'shadow-sm',
      'overflow-x-auto'
    );
    expect(capsule).not.toHaveClass(
      'bg-background/80',
      'dark:bg-muted/30',
      'border-border/50',
      'backdrop-blur-md',
      'shadow-lg'
    );
    expect(capsule.parentElement).toHaveClass(
      'sticky',
      'top-0',
      'max-md:fixed'
    );
  });

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

  it('folds everything foldable when the container has no width', () => {
    mount(0);

    expect(
      screen.getByRole('button', { name: KEY.moreTools })
    ).toBeInTheDocument();
    for (const tool of [...EARLY_TOOLS, ...LATE_TOOLS]) {
      expect(
        screen.queryByRole('button', { name: tool.labelKey })
      ).not.toBeInTheDocument();
    }
  });
});

describe.each([
  { platform: 'Macintosh', notation: 'mac' },
  { platform: 'Windows', notation: 'other' },
] as const)(
  'EditorToolbar shortcut hints on $platform',
  ({ platform, notation }) => {
    beforeEach(() => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(platform);
    });

    it('writes each tooltip shortcut in the platform notation', async () => {
      mount(TOOLBAR_FOLD_WIDTHS.early);

      for (const [name, hints] of Object.entries(SHORTCUT_HINTS)) {
        act(() => {
          screen.getByRole('button', { name }).focus();
        });
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
          `${name} (${hints[notation]})`
        );
      }
    });

    it('labels the link control without a shortcut it does not have', async () => {
      mount(TOOLBAR_FOLD_WIDTHS.early);

      act(() => {
        screen.getByRole('button', { name: KEY.link }).focus();
      });

      expect((await screen.findByRole('tooltip')).textContent).toBe(KEY.link);
    });

    it('writes each folded tool shortcut in the platform notation', async () => {
      mount(TOOLBAR_FOLD_WIDTHS.late - 1);
      await openOverflowMenu();

      for (const tool of [...EARLY_TOOLS, ...LATE_TOOLS]) {
        if (!tool.shortcut) {
          continue;
        }
        expect(Object.keys(SHORTCUT_HINTS)).toContain(tool.labelKey);
        const hint = SHORTCUT_HINTS[tool.labelKey]?.[notation];
        expect(
          screen.getByRole(tool.isActive ? 'menuitemcheckbox' : 'menuitem', {
            name: startsWith(tool.labelKey),
          })
        ).toHaveTextContent(`${tool.labelKey}${hint}`);
      }
    });
  }
);

describe('EditorToolbar overflow menu', () => {
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

  it('leaves focus off the trigger after running a tool from the menu', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early - 1);
    await openOverflowMenu();

    await userEvent.click(
      screen.getByRole('menuitem', { name: startsWith(KEY.horizontalRule) })
    );

    expect(
      screen.getByRole('button', { name: KEY.moreTools })
    ).not.toHaveFocus();
  });

  it('returns focus to the trigger when the menu is dismissed', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early - 1);
    await openOverflowMenu();

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: KEY.moreTools })).toHaveFocus();
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

describe('EditorToolbar keyboard navigation', () => {
  it('exposes the row as a horizontal toolbar with its first control as the only tab stop', () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);

    expect(getToolbar()).toHaveAttribute('aria-orientation', 'horizontal');
    expect(tabStops()).toEqual([control(KEY.heading)]);
    for (const button of within(getToolbar()).getAllByRole('button')) {
      expect(button.tabIndex).toBe(button === control(KEY.heading) ? 0 : -1);
    }
  });

  it('enters on the first control and leaves on the next Tab', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);

    await userEvent.tab();
    expect(control(KEY.heading)).toHaveFocus();

    await userEvent.tab();
    expect(document.body).toHaveFocus();
  });

  it('comes back to the last focused control when tabbing in again', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(control(KEY.italic)).toHaveFocus();

    await userEvent.tab();
    expect(document.body).toHaveFocus();
    await userEvent.tab({ shift: true });

    expect(control(KEY.italic)).toHaveFocus();
    expect(tabStops()).toEqual([control(KEY.italic)]);
  });

  it('moves focus to the next and previous control with ArrowRight and ArrowLeft', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);
    await userEvent.tab();

    await userEvent.keyboard('{ArrowRight}');
    expect(control(KEY.bold)).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(control(KEY.italic)).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(control(KEY.bold)).toHaveFocus();
  });

  it('wraps focus around both ends of the row', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early, { onVoiceNote: vi.fn() });
    await userEvent.tab();

    await userEvent.keyboard('{ArrowLeft}');
    expect(control(KEY.voiceNote)).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(control(KEY.heading)).toHaveFocus();
  });

  it('jumps to the first and last controls with Home and End', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early, { onVoiceNote: vi.fn() });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');

    await userEvent.keyboard('{End}');
    expect(control(KEY.voiceNote)).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(control(KEY.heading)).toHaveFocus();
  });

  it('skips controls that are disabled', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);
    expect(control(KEY.undo)).toBeDisabled();
    expect(control(KEY.redo)).toBeDisabled();
    await userEvent.tab();

    await userEvent.keyboard('{ArrowLeft}');
    expect(control(KEY.horizontalRule)).toHaveFocus();

    act(() => {
      editor.chain().insertContent(' edited').run();
    });
    await userEvent.keyboard('{ArrowRight}');

    expect(control(KEY.undo)).toHaveFocus();
  });

  it('leaves ArrowDown to a dropdown trigger so it still opens its menu', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);
    await userEvent.tab();

    await userEvent.keyboard('{ArrowDown}');

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: KEY.heading, hidden: true })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not take arrow, Home or End keys away from an open menu', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('menu');

    await userEvent.keyboard('{End}');
    const lastOption = screen.getByRole('menuitem', { name: KEY.heading3 });
    expect(lastOption).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');

    expect(lastOption).toHaveFocus();
  });

  it('does not take caret keys away from the link field', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);
    await userEvent.click(control(KEY.link));
    const field = within(getToolbar()).getByRole('textbox');
    await waitFor(() => expect(field).toHaveFocus());

    await userEvent.keyboard('{ArrowLeft}{ArrowRight}{Home}{End}');

    expect(field).toHaveFocus();
  });

  it('leaves modified arrow keys to the browser', async () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);
    await userEvent.tab();

    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');

    expect(control(KEY.heading)).toHaveFocus();
  });

  it('keeps the tab stop on its control while other controls join the row', async () => {
    const { rerender } = mount(TOOLBAR_FOLD_WIDTHS.early);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');

    rerender({ onAskAI: vi.fn() });

    expect(control(KEY.askAI)).toBeInTheDocument();
    expect(tabStops()).toEqual([control(KEY.bold)]);
  });

  it('hands the tab stop to the first control when its control leaves the row', async () => {
    const { rerender } = mount(TOOLBAR_FOLD_WIDTHS.early, {
      onVoiceNote: vi.fn(),
    });
    await userEvent.tab();
    await userEvent.keyboard('{End}');
    expect(control(KEY.voiceNote)).toHaveFocus();

    rerender({});

    expect(tabStops()).toEqual([control(KEY.heading)]);
    await userEvent.tab();
    expect(control(KEY.heading)).toHaveFocus();
  });

  it('hands the tab stop on when its control folds into the overflow menu', async () => {
    const resizeTo = captureResizes();
    mount(TOOLBAR_FOLD_WIDTHS.early);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowLeft}');
    expect(control(KEY.horizontalRule)).toHaveFocus();

    resizeTo(TOOLBAR_FOLD_WIDTHS.early - 1);

    expect(
      within(getToolbar()).queryByRole('button', { name: KEY.horizontalRule })
    ).not.toBeInTheDocument();
    expect(tabStops()).toEqual([control(KEY.heading)]);
    await userEvent.tab();
    expect(control(KEY.heading)).toHaveFocus();
  });
});

describe('EditorToolbar autocomplete toggle', () => {
  it('stays out of the row when the host offers no toggle', () => {
    mount(TOOLBAR_FOLD_WIDTHS.early);

    expect(
      screen.queryByRole('button', { name: KEY.autocomplete })
    ).not.toBeInTheDocument();
  });

  it('reports the autocomplete state it was given', () => {
    mount(TOOLBAR_FOLD_WIDTHS.early, {
      autocompleteEnabled: false,
      onToggleAutocomplete: vi.fn(),
    });

    expect(
      screen.getByRole('button', { name: KEY.autocomplete })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the button pressed while autocomplete is on', () => {
    mount(TOOLBAR_FOLD_WIDTHS.early, {
      autocompleteEnabled: true,
      onToggleAutocomplete: vi.fn(),
    });

    expect(
      screen.getByRole('button', { name: KEY.autocomplete })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('hands the toggle back to the host on click', async () => {
    const onToggleAutocomplete = vi.fn();
    mount(TOOLBAR_FOLD_WIDTHS.early, {
      autocompleteEnabled: true,
      onToggleAutocomplete,
    });

    await userEvent.click(
      screen.getByRole('button', { name: KEY.autocomplete })
    );

    expect(onToggleAutocomplete).toHaveBeenCalledTimes(1);
  });
});
