import { render, screen } from '@testing-library/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';
import { AI_BLOCK_STATUS, type AIBlockStatus } from '@knowtis/editor-schema';

import { ReadOnlyEditor } from '../../components/ReadOnlyEditor';
import { createBaseExtensions } from '../base-extensions';

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

function EditableNote({ content }: { content: string }) {
  const editor = useEditor({
    extensions: createBaseExtensions(),
    content,
    editable: true,
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
