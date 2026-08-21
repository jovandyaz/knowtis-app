import { createRef } from 'react';

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor, Range } from '@tiptap/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TagNode } from '@knowtis/shared-types';

import {
  TagSuggestionMenu,
  type TagSuggestionMenuRef,
} from './TagSuggestionMenu';

const tags = vi.fn<() => TagNode[]>();
const noteTags = vi.fn<() => string[]>();
const updateNote = vi.fn();

vi.mock('@knowtis/data-access-notes', () => ({
  useTags: () => ({ data: tags() }),
  useNote: () => ({ data: { tags: noteTags() } }),
  useUpdateNote: () => ({ mutate: updateNote }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars?.['path'] ? `${key}:${String(vars['path'])}` : key,
  }),
}));

const NOTE_ID = 'note-1';
const RANGE: Range = { from: 4, to: 9 };

const deleteRange = vi.fn().mockReturnThis();
const run = vi.fn();
const editor = {
  chain: () => ({
    focus: () => ({ deleteRange: (range: Range) => deleteRange(range) }),
  }),
} as unknown as Editor;

function tagNode(path: string): TagNode {
  return { id: path, path, color: null, noteCount: 1 };
}

function renderMenu(query: string, ref?: React.Ref<TagSuggestionMenuRef>) {
  return render(
    <TagSuggestionMenu
      ref={ref ?? null}
      noteId={NOTE_ID}
      query={query}
      range={RANGE}
      editor={editor}
    />
  );
}

describe('TagSuggestionMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteRange.mockReturnValue({ run });
    tags.mockReturnValue([tagNode('work'), tagNode('work/alpha')]);
    noteTags.mockReturnValue([]);
  });

  it('offers the vocabulary matching what has been typed', () => {
    renderMenu('alpha');

    expect(screen.getByText('work/alpha')).toBeInTheDocument();
    expect(screen.queryByText('work')).not.toBeInTheDocument();
  });

  it('leaves out tags the note already carries', () => {
    noteTags.mockReturnValue(['work/alpha']);

    renderMenu('');

    expect(screen.queryByText('work/alpha')).not.toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
  });

  it('offers to create a path the vocabulary does not have yet', () => {
    renderMenu('reading');

    expect(
      screen.getByText('organization.tags.create:reading')
    ).toBeInTheDocument();
  });

  it('does not offer to create a path the server would reject', () => {
    renderMenu('Not A Tag!');

    expect(screen.getByText('organization.tags.invalid')).toBeInTheDocument();
  });

  // Inline `#` is an input method for metadata, not content markup: the typed
  // text leaves the document so note_tags stays the tag's only home.
  it('removes the typed text and adds the tag to the note', async () => {
    const user = userEvent.setup();
    noteTags.mockReturnValue(['work']);
    renderMenu('alpha');

    await user.click(screen.getByText('work/alpha'));

    expect(deleteRange).toHaveBeenCalledWith(RANGE);
    expect(run).toHaveBeenCalled();
    expect(updateNote).toHaveBeenCalledWith({
      id: NOTE_ID,
      input: { tags: ['work', 'work/alpha'] },
    });
  });

  it('commits the highlighted option on Enter', () => {
    const ref = createRef<TagSuggestionMenuRef>();
    renderMenu('work', ref);

    act(() => {
      ref.current?.onKeyDown({
        event: new KeyboardEvent('keydown', { key: 'ArrowDown' }),
      });
    });
    act(() => {
      ref.current?.onKeyDown({
        event: new KeyboardEvent('keydown', { key: 'Enter' }),
      });
    });

    expect(updateNote).toHaveBeenCalledWith({
      id: NOTE_ID,
      input: { tags: ['work/alpha'] },
    });
  });
});
