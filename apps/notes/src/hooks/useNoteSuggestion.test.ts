import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUGGEST_IDLE_MS } from '@knowtis/shared-types';

import { useNoteSuggestion } from './useNoteSuggestion';

const suggestMutate = vi.fn();
const toastError = vi.fn();
const toastPlain = vi.fn();

vi.mock('@knowtis/data-access-notes', () => ({
  useSuggestOrganization: () => ({
    mutate: suggestMutate,
    isPending: false,
    reset: vi.fn(),
  }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toastPlain(...args), {
    error: (...args: unknown[]) => toastError(...args),
  }),
}));

const LONG_BODY = `<p>${'a'.repeat(400)}</p>`;
const SHORT_BODY = '<p>too little</p>';

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
    toastError.mockClear();
    toastPlain.mockClear();
    suggestMutate.mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not suggest while the author is still typing', () => {
    const { result } = setup();

    act(() => result.current.reportEdit(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS - 1));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should suggest once the editor has been idle', () => {
    const { result } = setup();

    act(() => result.current.reportEdit(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).toHaveBeenCalledTimes(1);
  });

  it('should push the deadline out on every keystroke', () => {
    const { result } = setup();

    act(() => result.current.reportEdit(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS - 100));
    act(() => result.current.reportEdit(`${LONG_BODY}<p>more</p>`));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS - 100));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should suggest at most once per note per session', () => {
    const { result } = setup();

    act(() => result.current.reportEdit(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));
    act(() => result.current.reportEdit(`${LONG_BODY}<p>again</p>`));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).toHaveBeenCalledTimes(1);
  });

  it('should never suggest again once the author dismissed the card', () => {
    const { result } = setup();

    act(() => result.current.dismiss());
    act(() => result.current.reportEdit(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should leave a note that already has a bucket alone', () => {
    const { result } = setup({ bucket: 'projects' });

    act(() => result.current.reportEdit(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should ignore a note too thin to place', () => {
    const { result } = setup();

    act(() => result.current.reportEdit(SHORT_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should measure the body text, not the editor markup', () => {
    const { result } = setup();
    const markupHeavy = `${'<p><strong></strong></p>'.repeat(40)}<p>short</p>`;

    act(() => result.current.reportEdit(markupHeavy));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should stay silent when suggestions are switched off', () => {
    const { result } = setup({ enabled: false });

    act(() => result.current.reportEdit(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).not.toHaveBeenCalled();
  });

  it('should let the author ask on demand whatever the note looks like', () => {
    const { result } = setup({ bucket: 'archive' });

    act(() => result.current.request());

    expect(suggestMutate).toHaveBeenCalledTimes(1);
  });

  it('should tell the author when their own ask fails', () => {
    suggestMutate.mockImplementation((_ids, handlers) => handlers.onError?.());
    const { result } = setup();

    act(() => result.current.request());

    expect(toastError).toHaveBeenCalledWith('organization.suggestion.failed');
  });

  it('should tell the author when their own ask came back empty', () => {
    suggestMutate.mockImplementation((_ids, handlers) =>
      handlers.onSuccess?.([])
    );
    const { result } = setup();

    act(() => result.current.request());

    expect(result.current.suggestion).toBeNull();
    expect(toastPlain).toHaveBeenCalledWith('organization.suggestion.empty');
  });

  it('should stay quiet when the unsolicited pass finds nothing', () => {
    suggestMutate.mockImplementation((_ids, handlers) => {
      handlers.onSuccess?.([]);
      expect(handlers.onError).toBeUndefined();
    });
    const { result } = setup();

    act(() => result.current.reportEdit(LONG_BODY));
    act(() => vi.advanceTimersByTime(SUGGEST_IDLE_MS));

    expect(suggestMutate).toHaveBeenCalledTimes(1);
    expect(toastPlain).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
