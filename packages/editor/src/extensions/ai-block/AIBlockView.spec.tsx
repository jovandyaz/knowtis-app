import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';
import { AI_BLOCK_STATUS, type AIBlockStatus } from '@knowtis/editor-schema';

import { ReadOnlyEditor } from '../../components/ReadOnlyEditor';
import { createBaseExtensions } from '../base-extensions';
import type { AIBlockProvider } from './ai-block-provider';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const INTRO = 'Notes on Rome';
const GENERATED = 'Rome was founded in 753 BC.';
const FAILURE = 'The model timed out';

const STORED_IMAGE =
  'https://iy4r311mpkfdcnup.public.blob.vercel-storage.com/notes/n1/chart.webp';
const RAW_IMAGE = '<img src="https://attacker.example/raw.png">';
const RAW_SCRIPT = '<script>window.pwned = true</script>';
const HOSTILE_CONTENT = [
  '![beacon](https://attacker.example/t.png)',
  RAW_IMAGE,
  RAW_SCRIPT,
  '![inline](data:image/png;base64,AAAA)',
  '[run](javascript:alert(1))',
  '[plain](http://attacker.example/page)',
  `![chart](${STORED_IMAGE})`,
  '[docs](https://example.com/docs)',
  '[mail](mailto:team@example.com)',
].join('\n\n');

function attributeValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

function noteWithBlock(status: AIBlockStatus, content = GENERATED): string {
  return `<p>${INTRO}</p><div data-ai-block="" topic="Rome" status="${status}" content="${attributeValue(content)}" errormessage="${FAILURE}"></div>`;
}

function EditableNote({
  content,
  onCreate,
  aiBlockProvider,
}: {
  content: string;
  onCreate?: (editor: Editor) => void;
  aiBlockProvider?: AIBlockProvider;
}) {
  const editor = useEditor({
    extensions: createBaseExtensions({
      ...(aiBlockProvider && { aiBlockProvider }),
    }),
    content,
    editable: true,
    onCreate: ({ editor: created }) => onCreate?.(created),
  });
  return (
    <TooltipProvider>
      <EditorContent editor={editor} />
    </TooltipProvider>
  );
}

function buttonNames(): string[] {
  return screen
    .queryAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? button.textContent);
}

describe('AIBlockView in a read-only editor', () => {
  it('shows a finished block as its text alone, taking no focus', async () => {
    render(<ReadOnlyEditor content={noteWithBlock(AI_BLOCK_STATUS.DONE)} />);

    expect(await screen.findByText(GENERATED)).toBeInTheDocument();
    expect(buttonNames()).toEqual([]);
    expect(screen.queryByRole('group')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it.each([
    AI_BLOCK_STATUS.INPUT,
    AI_BLOCK_STATUS.STREAMING,
    AI_BLOCK_STATUS.ERROR,
  ])('renders nothing for a block that is still %s', async (status) => {
    render(<ReadOnlyEditor content={noteWithBlock(status)} />);

    expect(await screen.findByText(INTRO)).toBeInTheDocument();
    expect(screen.queryByText(GENERATED)).toBeNull();
    expect(screen.queryByText(FAILURE)).toBeNull();
    expect(buttonNames()).toEqual([]);
    expect(
      screen.queryByRole('textbox', { name: 'ai.aiBlock.title' })
    ).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('AIBlockView in an editable editor', () => {
  it('keeps the controls of a finished block and takes focus', async () => {
    render(<EditableNote content={noteWithBlock(AI_BLOCK_STATUS.DONE)} />);

    const block = await screen.findByRole('group', {
      name: 'ai.aiBlock.title',
    });
    expect(buttonNames()).toEqual([
      'ai.aiBlock.insert',
      'ai.aiBlock.retry',
      'ai.aiBlock.discard',
    ]);
    expect(screen.getByText(GENERATED)).toBeInTheDocument();
    expect(document.activeElement).toBe(block);
  });
});

describe('dismissing a finished block with Escape', () => {
  it('discards the block on a plain Escape', async () => {
    const user = userEvent.setup();
    render(<EditableNote content={noteWithBlock(AI_BLOCK_STATUS.DONE)} />);
    await screen.findByRole('group', { name: 'ai.aiBlock.title' });

    await user.keyboard('{Escape}');

    expect(screen.queryByText(GENERATED)).toBeNull();
  });

  it('keeps the block when the Escape cancels an IME composition', async () => {
    render(<EditableNote content={noteWithBlock(AI_BLOCK_STATUS.DONE)} />);
    const block = await screen.findByRole('group', {
      name: 'ai.aiBlock.title',
    });

    fireEvent.keyDown(block, { key: 'Escape', isComposing: true });

    expect(screen.getByText(GENERATED)).toBeInTheDocument();
  });

  it('keeps a streaming block when Escape closes a link dialog', async () => {
    const user = userEvent.setup();
    const provider: AIBlockProvider = {
      async *stream({ signal }) {
        yield { text: '[docs](https://example.com/docs)' };
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve())
        );
      },
    };
    render(
      <EditableNote
        content={noteWithBlock(AI_BLOCK_STATUS.INPUT)}
        aiBlockProvider={provider}
      />
    );
    await user.type(await screen.findByRole('textbox'), 'Rome');
    await user.click(
      screen.getByRole('button', { name: 'ai.aiBlock.generate' })
    );
    await user.click(await screen.findByRole('button', { name: 'docs' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'ai.aiBlock.cancel' })
    ).toBeInTheDocument();
  });

  it('discards the block on Escape while a control shows its tooltip', async () => {
    const user = userEvent.setup();
    render(<EditableNote content={noteWithBlock(AI_BLOCK_STATUS.DONE)} />);
    await screen.findByRole('group', { name: 'ai.aiBlock.title' });
    await user.tab();
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'ai.aiBlock.retry' })
    ).toHaveFocus();
    await screen.findByRole('tooltip');

    await user.keyboard('{Escape}');

    expect(screen.queryByText(GENERATED)).toBeNull();
  });

  it('closes only the link dialog on Escape and keeps the block', async () => {
    const user = userEvent.setup();
    render(
      <EditableNote
        content={noteWithBlock(
          AI_BLOCK_STATUS.DONE,
          '[docs](https://example.com/docs)'
        )}
      />
    );
    await user.click(await screen.findByRole('button', { name: 'docs' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('group', { name: 'ai.aiBlock.title' })
    ).toBeInTheDocument();
  });
});

describe('inserting a finished block', () => {
  it('joins a soft line break the way the block showed it', async () => {
    const user = userEvent.setup();
    let editor: Editor | undefined;
    render(
      <EditableNote
        content={`${noteWithBlock(AI_BLOCK_STATUS.DONE, 'line one\nline two')}<p>outro</p>`}
        onCreate={(created) => {
          editor = created;
        }}
      />
    );

    const insert = await screen.findByRole('button', {
      name: 'ai.aiBlock.insert',
    });
    if (!editor) {
      throw new Error('editor was not created');
    }
    // Insert focuses the editor, whose next frame scrolls to the caret through
    // layout APIs jsdom does not implement.
    vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });

    await user.click(insert);

    const blocks: [string, string][] = [];
    editor.state.doc.forEach((node) => {
      blocks.push([node.type.name, node.textContent]);
    });
    expect(blocks).toEqual([
      ['paragraph', INTRO],
      ['paragraph', 'line one line two'],
      ['paragraph', 'outro'],
    ]);
  });
});

describe.each([
  ['read-only', ReadOnlyEditor],
  ['editable', EditableNote],
])('a finished block in the %s editor', (_mode, Note) => {
  it('renders only blob-store images and https or mailto links', async () => {
    const { container } = render(
      <Note content={noteWithBlock(AI_BLOCK_STATUS.DONE, HOSTILE_CONTENT)} />
    );

    await screen.findByText('docs');
    expect(
      [...container.querySelectorAll('img')].map((img) =>
        img.getAttribute('src')
      )
    ).toEqual([STORED_IMAGE]);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain(RAW_IMAGE);
    expect(container.textContent).toContain(RAW_SCRIPT);
    expect(
      [...container.querySelectorAll('[data-streamdown="link"]')].map(
        (link) => link.textContent
      )
    ).toEqual(['docs', 'mail']);
    expect(screen.getByText('run').tagName).toBe('P');
    expect(screen.getByText('plain').tagName).toBe('P');
  });
});
