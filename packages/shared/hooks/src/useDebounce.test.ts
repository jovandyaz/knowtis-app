import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));

    expect(result.current).toBe('initial');
  });

  it('should debounce value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    );

    expect(result.current).toBe('initial');

    // Change the value
    rerender({ value: 'updated', delay: 300 });

    // Value should not change immediately
    expect(result.current).toBe('initial');

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Now value should be updated
    expect(result.current).toBe('updated');
  });

  it('should reset timer on rapid value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    );

    // Rapid changes
    rerender({ value: 'b', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'c', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'd', delay: 300 });

    // Value should still be 'a' (initial)
    expect(result.current).toBe('a');

    // Complete the debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should be final value
    expect(result.current).toBe('d');
  });

  it('should use default delay of 300ms', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });

    // Should not update before 300ms
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('initial');

    // Should update at 300ms
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('updated');
  });
});
