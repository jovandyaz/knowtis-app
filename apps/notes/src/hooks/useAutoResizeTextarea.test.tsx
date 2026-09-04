import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAutoResizeTextarea } from './useAutoResizeTextarea';

function textarea(scrollHeight: number) {
  const element = document.createElement('textarea');
  vi.spyOn(element, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  return element;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAutoResizeTextarea', () => {
  it('sizes the textarea to its content on mount', () => {
    const ref = { current: textarea(48) };
    renderHook(() => useAutoResizeTextarea(ref, 'two\nlines'));
    expect(ref.current.style.height).toBe('48px');
  });

  it('re-sizes when the value changes', () => {
    const ref = { current: textarea(24) };
    const { rerender } = renderHook(
      ({ value }) => useAutoResizeTextarea(ref, value),
      { initialProps: { value: 'a' } }
    );
    expect(ref.current.style.height).toBe('24px');

    vi.spyOn(ref.current, 'scrollHeight', 'get').mockReturnValue(72);
    rerender({ value: 'a\nb\nc' });
    expect(ref.current.style.height).toBe('72px');
  });

  it('does nothing without an element', () => {
    const ref = { current: null };
    expect(() =>
      renderHook(() => useAutoResizeTextarea(ref, 'x'))
    ).not.toThrow();
  });
});
