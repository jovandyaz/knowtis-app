import { useNoteEditorStore } from '@/stores/note-editor.store';
import { act, renderHook } from '@testing-library/react';
import { DOMParser as ProseMirrorDOMParser, Schema } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNote } from '@knowtis/data-access-notes';

import { useProposalBefore } from './useProposalBefore';

vi.mock('@knowtis/data-access-notes', () => ({ useNote: vi.fn() }));

const mockedUseNote = vi.mocked(useNote);

interface QueryOverrides {
  data?: { id: string; title: string; content: string };
  isError?: boolean;
  isFetching?: boolean;
  isSuccess?: boolean;
}

function queryResult({ data, ...rest }: QueryOverrides) {
  return {
    data,
    isError: false,
    isFetching: false,
    isSuccess: data !== undefined,
    ...rest,
  } as unknown as ReturnType<typeof useNote>;
}

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
});

function editorWith(html: string): Editor {
  const container = document.createElement('div');
  container.innerHTML = html;
  return {
    isDestroyed: false,
    state: { doc: ProseMirrorDOMParser.fromSchema(schema).parse(container) },
    getHTML: () => html,
  } as unknown as Editor;
}

const liveEditor = editorWith('<p>live</p>');
const unsyncedEditor = editorWith('<p></p>');

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

  it('recaptures the live snapshot when a new proposal arrives for the same note', () => {
    useNoteEditorStore.getState().attach('n1', liveEditor, 'Live title');
    const { result, rerender } = renderHook(
      ({ proposalId }) => useProposalBefore(proposalId, 'n1'),
      { initialProps: { proposalId: 'p1' } }
    );
    expect(result.current).toMatchObject({ title: 'Live title' });

    act(() => useNoteEditorStore.getState().setTitle('n1', 'Updated title'));
    rerender({ proposalId: 'p2' });

    expect(result.current).toMatchObject({ title: 'Updated title' });
  });

  it('falls back to the note query when another note is open', () => {
    useNoteEditorStore.getState().attach('other', liveEditor, 'Other');
    mockedUseNote.mockReturnValue(
      queryResult({
        data: { id: 'n1', title: 'Cached', content: '<p>cached</p>' },
      })
    );

    const { result } = renderHook(() => useProposalBefore('p1', 'n1'));

    expect(mockedUseNote).toHaveBeenCalledWith('n1');
    expect(result.current).toEqual({
      status: 'ready',
      isLive: false,
      title: 'Cached',
      contentHtml: '<p>cached</p>',
    });
  });

  it('freezes the fallback snapshot once resolved and ignores later cache updates for the same proposal', () => {
    mockedUseNote.mockReturnValue(
      queryResult({
        data: { id: 'n1', title: 'Cached', content: '<p>cached</p>' },
      })
    );

    const { result, rerender } = renderHook(() =>
      useProposalBefore('p1', 'n1')
    );
    expect(result.current).toEqual({
      status: 'ready',
      isLive: false,
      title: 'Cached',
      contentHtml: '<p>cached</p>',
    });

    mockedUseNote.mockReturnValue(
      queryResult({
        data: { id: 'n1', title: 'Changed', content: '<p>changed</p>' },
      })
    );
    rerender();

    expect(result.current).toEqual({
      status: 'ready',
      isLive: false,
      title: 'Cached',
      contentHtml: '<p>cached</p>',
    });
    expect(mockedUseNote).toHaveBeenLastCalledWith(undefined);
  });

  it('ignores a stale cache entry that is still refetching on mount', () => {
    const stale = { id: 'n1', title: 'Stale', content: '<p>stale</p>' };
    mockedUseNote.mockReturnValue(
      queryResult({ data: stale, isFetching: true })
    );

    const { result, rerender } = renderHook(() =>
      useProposalBefore('p1', 'n1')
    );
    expect(result.current).toEqual({ status: 'loading' });

    mockedUseNote.mockReturnValue(
      queryResult({
        data: { id: 'n1', title: 'Fresh', content: '<p>fresh</p>' },
      })
    );
    rerender();

    expect(result.current).toEqual({
      status: 'ready',
      isLive: false,
      title: 'Fresh',
      contentHtml: '<p>fresh</p>',
    });
  });

  it('keeps the frozen fallback when the target note is opened mid-review', () => {
    mockedUseNote.mockReturnValue(
      queryResult({
        data: { id: 'n1', title: 'Cached', content: '<p>cached</p>' },
      })
    );
    const { result, rerender } = renderHook(() =>
      useProposalBefore('p1', 'n1')
    );
    expect(result.current).toEqual({
      status: 'ready',
      isLive: false,
      title: 'Cached',
      contentHtml: '<p>cached</p>',
    });

    act(() =>
      useNoteEditorStore.getState().attach('n1', liveEditor, 'Live title')
    );
    rerender();

    expect(result.current).toEqual({
      status: 'ready',
      isLive: true,
      title: 'Cached',
      contentHtml: '<p>cached</p>',
    });
  });

  it('ignores a live editor whose document has not synced yet', () => {
    useNoteEditorStore.getState().attach('n1', unsyncedEditor, 'Live title');
    mockedUseNote.mockReturnValue(
      queryResult({
        data: { id: 'n1', title: 'Cached', content: '<p>cached</p>' },
      })
    );

    const { result } = renderHook(() => useProposalBefore('p1', 'n1'));

    expect(mockedUseNote).toHaveBeenCalledWith('n1');
    expect(result.current).toEqual({
      status: 'ready',
      isLive: true,
      title: 'Cached',
      contentHtml: '<p>cached</p>',
    });
  });

  it('recaptures from the live editor when a new proposal arrives after a fallback', () => {
    mockedUseNote.mockReturnValue(
      queryResult({
        data: { id: 'n1', title: 'Cached', content: '<p>cached</p>' },
      })
    );
    const { result, rerender } = renderHook(
      ({ proposalId }) => useProposalBefore(proposalId, 'n1'),
      { initialProps: { proposalId: 'p1' } }
    );
    expect(result.current).toEqual({
      status: 'ready',
      isLive: false,
      title: 'Cached',
      contentHtml: '<p>cached</p>',
    });

    act(() =>
      useNoteEditorStore.getState().attach('n1', liveEditor, 'Live title')
    );
    rerender({ proposalId: 'p2' });

    expect(result.current).toEqual({
      status: 'ready',
      isLive: true,
      title: 'Live title',
      contentHtml: '<p>live</p>',
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
