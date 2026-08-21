import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUGGEST_IDLE_MS } from '@knowtis/shared-types';

import { useNoteSuggestion } from './useNoteSuggestion';

const suggestMutate = vi.fn();

vi.mock('@knowtis/data-access-notes', () => ({
  useSuggestOrganization: () => ({
    mutate: suggestMutate,
    isPending: false,
    reset: vi.fn(),
  }),
}));

const LONG_BODY = `<p>${'a'.repeat(400)}</p>`;
const SHORT_BODY = '<p>too little</p>';

// The module tracks "once per session" outside React, so every test owns an id.
let nextId = 0;
const freshNoteId = () => `note-${++nextId}`;

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    noteId: freshNoteId(),
    bucket: null,
    isOwner: true,
    enabled: true,
    ...overrides,
  };
  return renderHook(() =>
    useNoteSuggestion(props as Parameters<typeof useNoteSuggestion>[0])
  );
}

describe('useNoteSuggestion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    suggestMutate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not suggest while the author is still typing', () => {
    const { result } = setup();

    act(() => result.current.noteEdited(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS - 1));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should suggest once the editor has been idle', () => {
    const { result } = setup();

    act(() => result.current.noteEdited(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).toHaveBeenCalledTimes(1);
  });

  it('should push the deadline out on every keystroke', () => {
    const { result } = setup();

    act(() => result.current.noteEdited(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS - 100));
    act(() => result.current.noteEdited(`${LONG_BODY}<p>more</p>`));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS - 100));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should suggest at most once per note per session', () => {
    const { result } = setup();

    act(() => result.current.noteEdited(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));
    act(() => result.current.noteEdited(`${LONG_BODY}<p>again</p>`));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).toHaveBeenCalledTimes(1);
  });

  it('should never suggest again once the author dismissed the card', () => {
    const { result } = setup();

    act(() => result.current.dismiss());
    act(() => result.current.noteEdited(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should leave a note that already has a bucket alone', () => {
    const { result } = setup({ bucket: 'projects' });

    act(() => result.current.noteEdited(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should ignore a note too thin to place', () => {
    const { result } = setup();

    act(() => result.current.noteEdited(SHORT_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  // Markup is not body: a wrapper full of tags must not clear the threshold.
  it('should measure the body text, not the editor markup', () => {
    const { result } = setup();
    const markupHeavy = `${'<p><strong></strong></p>'.repeat(40)}<p>short</p>`;

    act(() => result.current.noteEdited(markupHeavy));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should stay silent when suggestions are switched off', () => {
    const { result } = setup({ enabled: false });

    act(() => result.current.noteEdited(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should let the author ask on demand whatever the note looks like', () => {
    const { result } = setup({ bucket: 'archive' });

    act(() => result.current.request());

    expect(suggestMutate).toHaveBeenCalledTimes(1);
  });
});
