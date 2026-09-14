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

  it('does not listen for resizes while disabled', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');

    renderHook(() => useViewportWidth(false));

    expect(resizeListenerCount(addEventListener)).toBe(0);
    addEventListener.mockRestore();
  });

  it('keeps the width read at call time while disabled', () => {
    const { result } = renderHook(() => useViewportWidth(false));

    act(() => {
      resizeTo(1600);
      vi.advanceTimersByTime(VIEWPORT_RESIZE_DEBOUNCE_MS * 5);
    });

    expect(result.current).toBe(1024);
  });

  it('reports one width after a burst of resizes', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useViewportWidth(true);
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

  it('picks up the width the viewport reached while it was disabled', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useViewportWidth(enabled),
      { initialProps: { enabled: false } }
    );

    act(() => {
      window.innerWidth = 1600;
    });
    rerender({ enabled: true });

    expect(result.current).toBe(1600);
  });

  it('drops the listener when it is disabled again', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(
      ({ enabled }) => useViewportWidth(enabled),
      { initialProps: { enabled: true } }
    );

    rerender({ enabled: false });

    expect(resizeListenerCount(removeEventListener)).toBe(1);
    removeEventListener.mockRestore();
  });
});
