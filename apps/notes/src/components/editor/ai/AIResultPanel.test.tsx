import { useState } from 'react';

import { useAIStore } from '@/stores/ai.store';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/react';
import type * as StreamdownModule from 'streamdown';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@knowtis/design-system';
import { createBaseExtensions } from '@knowtis/editor';
import { IMAGE_NODE_NAME } from '@knowtis/editor-schema';

import { AIResultPanel } from './AIResultPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('tippy.js', () => ({
  default: (_reference: Element, { content }: { content: HTMLElement }) => {
    document.body.appendChild(content);
    return { destroy: () => content.remove() };
  },
}));

vi.mock('streamdown', async (importOriginal) => ({
  ...(await importOriginal<typeof StreamdownModule>()),
  Streamdown: () => null,
}));

function createMockEditor(): Editor {
  const dom = document.createElement('div');
  Object.defineProperty(dom, 'getBoundingClientRect', {
    value: () => ({
      width: 400,
      height: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  return {
    view: {
      dom,
      coordsAtPos: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    },
    state: { selection: { to: 0 } },
    commands: { focus: vi.fn() },
  } as unknown as Editor;
}

function createTornDownEditor(): Editor {
  return {
    isDestroyed: true,
    get view(): never {
      throw new Error(
        "[tiptap error]: The editor view is not available. Cannot access view['dom']."
      );
    },
    state: { selection: { to: 0 } },
    commands: { focus: vi.fn() },
  } as unknown as Editor;
}

function pressEscape() {
  act(() => {
    fireEvent.keyDown(document.body, { key: 'Escape' });
  });
}

function TestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="Close dialog">
        <DialogTitle>Test dialog</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

describe('AIResultPanel', () => {
  afterEach(() => {
    act(() => {
      useAIStore.getState().reset();
    });
  });

  it('renders nothing once the editor behind it has been torn down', () => {
    useAIStore.setState({ status: 'error' });

    const { container } = render(
      <AIResultPanel editor={createTornDownEditor()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('discards the panel on Escape when it is the only layer', () => {
    const editor = createMockEditor();
    useAIStore.setState({ status: 'error' });
    render(<AIResultPanel editor={editor} />);

    pressEscape();

    expect(useAIStore.getState().status).toBe('idle');
    expect(editor.commands.focus).toHaveBeenCalledTimes(1);
  });

  it('closes a dialog opened over the panel and leaves the panel untouched', () => {
    const editor = createMockEditor();
    useAIStore.setState({ status: 'error' });
    const onOpenChange = vi.fn();
    render(
      <>
        <AIResultPanel editor={editor} />
        <TestDialog open onOpenChange={onOpenChange} />
      </>
    );

    pressEscape();

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(useAIStore.getState().status).toBe('error');
    expect(editor.commands.focus).not.toHaveBeenCalled();
  });

  it('lets the next Escape reach the panel once the dialog is gone', () => {
    const editor = createMockEditor();
    useAIStore.setState({ status: 'error' });

    function Harness() {
      const [dialogOpen, setDialogOpen] = useState(true);
      return (
        <>
          <AIResultPanel editor={editor} />
          <TestDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </>
      );
    }

    render(<Harness />);

    pressEscape();
    expect(useAIStore.getState().status).toBe('error');

    pressEscape();

    expect(useAIStore.getState().status).toBe('idle');
    expect(editor.commands.focus).toHaveBeenCalledTimes(1);
  });
});

const TWO_PARAGRAPHS = '<p>First para</p><p>Second para</p>';
const FIRST_PARAGRAPH = { from: 1, to: 11 };
const STRUCTURED_RESULT = '## Title\n\n- a\n- b';
const KEPT_SENTENCE = 'Kept sentence.';
const FOREIGN_IMAGE_RESULTS = [
  '<figure data-image><img src="https://attacker123.public.blob.vercel-storage.com/x.png"></figure>',
  '![x](https://evil.com/p.png)',
];
const REPLACE = 'ai.preview.replace';
const INSERT_BELOW = 'ai.preview.insertBelow';

describe('AIResultPanel inserting a finished result', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    act(() => {
      useAIStore.getState().reset();
    });
    if (editor && !editor.isDestroyed) {
      editor.destroy();
    }
    editor = null;
  });

  function finishOver(
    content: string,
    selectionRange: { from: number; to: number },
    streamedText: string
  ): Editor {
    const live = new Editor({
      element: document.createElement('div'),
      extensions: createBaseExtensions({ disableHistory: true }),
      content,
    });
    vi.spyOn(live.view, 'coordsAtPos').mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    editor = live;
    useAIStore.setState({ status: 'done', streamedText, selectionRange });
    render(<AIResultPanel editor={live} />);
    return live;
  }

  function choose(action: string) {
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: action }));
    });
  }

  function blocks(live: Editor): [string, string][] {
    const found: [string, string][] = [];
    live.state.doc.forEach((node) => {
      found.push([node.type.name, node.textContent]);
    });
    return found;
  }

  function imageSources(live: Editor): string[] {
    const sources: string[] = [];
    live.state.doc.descendants((node) => {
      if (node.type.name === IMAGE_NODE_NAME) {
        sources.push(String(node.attrs['src']));
      }
    });
    return sources;
  }

  it('replaces the selection with the Markdown structure the model wrote', () => {
    const live = finishOver(TWO_PARAGRAPHS, FIRST_PARAGRAPH, STRUCTURED_RESULT);

    choose(REPLACE);

    expect(blocks(live)).toEqual([
      ['heading', 'Title'],
      ['bulletList', 'ab'],
      ['paragraph', 'Second para'],
    ]);
    expect(useAIStore.getState().status).toBe('idle');
  });

  it('inserts the Markdown structure as blocks below the selection', () => {
    const live = finishOver(TWO_PARAGRAPHS, FIRST_PARAGRAPH, STRUCTURED_RESULT);

    choose(INSERT_BELOW);

    expect(blocks(live)).toEqual([
      ['paragraph', 'First para'],
      ['heading', 'Title'],
      ['bulletList', 'ab'],
      ['paragraph', 'Second para'],
    ]);
    expect(useAIStore.getState().status).toBe('idle');
  });

  it('joins a soft line break the way the preview renders it', () => {
    const live = finishOver(
      TWO_PARAGRAPHS,
      FIRST_PARAGRAPH,
      'line one\nline two'
    );

    choose(INSERT_BELOW);

    expect(blocks(live)).toEqual([
      ['paragraph', 'First para'],
      ['paragraph', 'line one line two'],
      ['paragraph', 'Second para'],
    ]);
  });

  it('keeps a one-paragraph answer inside the sentence it replaces', () => {
    const live = finishOver(
      '<p>Hello wrold and more</p>',
      { from: 7, to: 12 },
      'world'
    );

    choose(REPLACE);

    expect(blocks(live)).toEqual([['paragraph', 'Hello world and more']]);
  });

  it('keeps the heading whose text a one-paragraph answer replaces', () => {
    const live = finishOver(
      '<h2>Draft titel</h2><p>body</p>',
      { from: 1, to: 12 },
      'Draft title'
    );

    choose(REPLACE);

    expect(blocks(live)).toEqual([
      ['heading', 'Draft title'],
      ['paragraph', 'body'],
    ]);
  });

  it.each(
    FOREIGN_IMAGE_RESULTS.flatMap((result) => [
      [REPLACE, result],
      [INSERT_BELOW, result],
    ])
  )('%s inserts no image node from %s', (action, result) => {
    const live = finishOver(
      TWO_PARAGRAPHS,
      FIRST_PARAGRAPH,
      `${result}\n\n${KEPT_SENTENCE}`
    );

    choose(action);

    expect(live.getText()).toContain(KEPT_SENTENCE);
    expect(imageSources(live)).toEqual([]);
    expect(live.getHTML()).not.toContain('<img');
  });
});
