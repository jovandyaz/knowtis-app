import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutoResizeTextarea } from './useAutoResizeTextarea';

function textarea(scrollHeight: number, value = 'text') {
  const element = document.createElement('textarea');
  element.value = value;
  vi.spyOn(element, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  return element;
}

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

const observed = new Map<Element, ResizeCallback>();

function notify(target: Element, callback: ResizeCallback, width: number) {
  act(() => {
    callback([{ target, contentRect: { width } } as ResizeObserverEntry]);
  });
}

class FakeResizeObserver {
  readonly callback: ResizeCallback;
  constructor(callback: ResizeCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    observed.set(target, this.callback);
    notify(target, this.callback, (target as HTMLElement).clientWidth);
  }
  unobserve(target: Element) {
    observed.delete(target);
  }
  disconnect() {
    for (const [target, callback] of observed) {
      if (callback === this.callback) {
        observed.delete(target);
      }
    }
  }
}

function emitResize(target: Element, width: number) {
  const callback = observed.get(target);
  if (!callback) {
    throw new Error('target is not observed');
  }
  notify(target, callback, width);
}

const nativeResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  observed.clear();
  globalThis.ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = nativeResizeObserver;
  vi.restoreAllMocks();
});

describe('useAutoResizeTextarea', () => {
  it('sizes the textarea to its content on mount', () => {
    const ref = { current: textarea(48, 'two\nlines') };
    renderHook(() => useAutoResizeTextarea(ref, 'two\nlines'));
    expect(ref.current.style.height).toBe('48px');
  });

  it('re-sizes when the value changes', () => {
    const ref = { current: textarea(24, 'a') };
    const { rerender } = renderHook(
      ({ value }) => useAutoResizeTextarea(ref, value),
      { initialProps: { value: 'a' } }
    );
    expect(ref.current.style.height).toBe('24px');

    ref.current.value = 'a\nb\nc';
    vi.spyOn(ref.current, 'scrollHeight', 'get').mockReturnValue(72);
    rerender({ value: 'a\nb\nc' });
    expect(ref.current.style.height).toBe('72px');
  });

  // An empty textarea has nothing to measure, and the placeholder would wrap
  // against whatever width the panel happens to be mid-open.
  it('leaves an empty textarea to its CSS height', () => {
    const ref = { current: textarea(364, '') };
    renderHook(() => useAutoResizeTextarea(ref, ''));
    expect(ref.current.style.height).toBe('');
  });

  it('re-sizes when the element gets wider', () => {
    const ref = { current: textarea(364, 'a wrapping question') };
    renderHook(() => useAutoResizeTextarea(ref, 'a wrapping question'));
    expect(ref.current.style.height).toBe('364px');

    vi.spyOn(ref.current, 'scrollHeight', 'get').mockReturnValue(36);
    emitResize(ref.current, 482);
    expect(ref.current.style.height).toBe('36px');
  });

  it('ignores a resize entry whose width is unchanged', () => {
    const ref = { current: textarea(36, 'a') };
    renderHook(() => useAutoResizeTextarea(ref, 'a'));
    emitResize(ref.current, 482);

    vi.spyOn(ref.current, 'scrollHeight', 'get').mockReturnValue(999);
    emitResize(ref.current, 482);
    expect(ref.current.style.height).toBe('36px');
  });

  it('stops observing on unmount', () => {
    const ref = { current: textarea(36) };
    const { unmount } = renderHook(() => useAutoResizeTextarea(ref, 'text'));
    expect(observed.has(ref.current)).toBe(true);

    unmount();
    expect(observed.has(ref.current)).toBe(false);
  });

  it('does nothing without an element', () => {
    const ref = { current: null };
    expect(() =>
      renderHook(() => useAutoResizeTextarea(ref, 'x'))
    ).not.toThrow();
  });
});
