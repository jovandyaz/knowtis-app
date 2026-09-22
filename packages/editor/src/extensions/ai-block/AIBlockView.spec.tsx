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

function noteWithBlock(status: AIBlockStatus): string {
  return `<p>${INTRO}</p><div data-ai-block="" topic="Rome" status="${status}" content="${GENERATED}" errormessage="${FAILURE}"></div>`;
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
