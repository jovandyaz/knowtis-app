import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedMerge } from './useDebouncedMerge';

interface Patch {
  title: string;
  content: string;
}

describe('useDebouncedMerge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges partial calls into a single invocation instead of clobbering', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedMerge<Patch>(save, 500));

    act(() => {
      result.current({ content: 'c' });
      result.current({ title: 't' });
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ content: 'c', title: 't' });
  });

  it('keeps the latest value when the same field is queued twice', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedMerge<Patch>(save, 500));

    act(() => {
      result.current({ title: 'first' });
      result.current({ title: 'second' });
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(save).toHaveBeenCalledWith({ title: 'second' });
  });

  it('starts a fresh payload after firing', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useDebouncedMerge<Patch>(save, 500));

    act(() => {
      result.current({ content: 'first' });
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current({ title: 'second' });
      vi.advanceTimersByTime(500);
    });

    expect(save).toHaveBeenNthCalledWith(1, { content: 'first' });
    expect(save).toHaveBeenNthCalledWith(2, { title: 'second' });
  });

  it('flushes the merged payload on unmount', () => {
    const save = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDebouncedMerge<Patch>(save, 500)
    );

    act(() => {
      result.current({ content: 'c' });
      result.current({ title: 't' });
    });
    expect(save).not.toHaveBeenCalled();

    act(() => {
      unmount();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ content: 'c', title: 't' });
  });

  it('does not invoke on unmount when nothing was queued', () => {
    const save = vi.fn();
    const { unmount } = renderHook(() => useDebouncedMerge<Patch>(save, 500));

    act(() => {
      unmount();
    });
    expect(save).not.toHaveBeenCalled();
  });
});
