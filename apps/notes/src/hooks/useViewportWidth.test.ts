import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useViewportWidth,
  VIEWPORT_RESIZE_DEBOUNCE_MS,
} from './useViewportWidth';

function resizeTo(width: number) {
  window.innerWidth = width;
  window.dispatchEvent(new Event('resize'));
}

function resizeListenerCount(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter((call) => call[0] === 'resize').length;
}

describe('useViewportWidth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.innerWidth = 1024;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the width the viewport has on the first render', () => {
    const { result } = renderHook(() => useViewportWidth());

    expect(result.current).toBe(1024);
  });

  it('listens for resizes as soon as it is mounted', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');

    renderHook(() => useViewportWidth());

    expect(resizeListenerCount(addEventListener)).toBe(1);
    addEventListener.mockRestore();
  });

  it('reports one width after a burst of resizes', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useViewportWidth();
    });
    const rendersBeforeBurst = renders;

    act(() => {
      resizeTo(1100);
      resizeTo(1200);
      resizeTo(1300);
      resizeTo(1400);
    });
    expect(result.current).toBe(1024);
    expect(renders).toBe(rendersBeforeBurst);

    act(() => {
      vi.advanceTimersByTime(VIEWPORT_RESIZE_DEBOUNCE_MS);
    });
    expect(result.current).toBe(1400);
    expect(renders).toBe(rendersBeforeBurst + 1);
  });

  it('drops the listener when it unmounts', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useViewportWidth());

    unmount();

    expect(resizeListenerCount(removeEventListener)).toBe(1);
    removeEventListener.mockRestore();
  });
});
