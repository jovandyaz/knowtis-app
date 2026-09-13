import { useNoteEditorStore } from '@/stores/note-editor.store';
import { act, renderHook } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNote } from '@knowtis/data-access-notes';

import { useProposalBefore } from './useProposalBefore';

vi.mock('@knowtis/data-access-notes', () => ({ useNote: vi.fn() }));

const mockedUseNote = vi.mocked(useNote);

function queryResult(overrides: Record<string, unknown>) {
  return { data: undefined, isError: false, ...overrides } as ReturnType<
    typeof useNote
  >;
}

const liveEditor = {
  isDestroyed: false,
  getHTML: () => '<p>live</p>',
} as unknown as Editor;

describe('useProposalBefore', () => {
  beforeEach(() => {
    useNoteEditorStore.setState({ noteId: null, editor: null, title: '' });
    mockedUseNote.mockReturnValue(queryResult({}));
  });

  it('snapshots the live editor when the target note is open and skips the query', () => {
    useNoteEditorStore.getState().attach('n1', liveEditor, 'Live title');

    const { result } = renderHook(() => useProposalBefore('p1', 'n1'));

    expect(result.current).toEqual({
      status: 'ready',
      isLive: true,
      title: 'Live title',
      contentHtml: '<p>live</p>',
    });
    expect(mockedUseNote).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps the same snapshot while the user keeps typing under the same proposal', () => {
    useNoteEditorStore.getState().attach('n1', liveEditor, 'Live title');
    const { result, rerender } = renderHook(() =>
      useProposalBefore('p1', 'n1')
    );

    act(() => useNoteEditorStore.getState().setTitle('n1', 'Edited'));
    rerender();

    expect(result.current).toMatchObject({ title: 'Live title' });
  });

  it('falls back to the note query when another note is open', () => {
    useNoteEditorStore.getState().attach('other', liveEditor, 'Other');
    mockedUseNote.mockReturnValue(
      queryResult({
        data: { id: 'n1', title: 'Cached', content: '<p>cached</p>' },
      })
    );

    const { result } = renderHook(() => useProposalBefore('p1', 'n1'));

    expect(mockedUseNote).toHaveBeenLastCalledWith('n1');
    expect(result.current).toEqual({
      status: 'ready',
      isLive: false,
      title: 'Cached',
      contentHtml: '<p>cached</p>',
    });
  });

  it('reports loading and error from the query', () => {
    const { result, rerender } = renderHook(() =>
      useProposalBefore('p1', 'n1')
    );
    expect(result.current).toEqual({ status: 'loading' });

    mockedUseNote.mockReturnValue(queryResult({ isError: true }));
    rerender();
    expect(result.current).toEqual({ status: 'error' });
  });
});
