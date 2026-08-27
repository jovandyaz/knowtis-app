import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountdown } from './useCountdown';

const ONE_MINUTE_MS = 60_000;

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the full duration', () => {
    const { result } = renderHook(() => useCountdown(ONE_MINUTE_MS));

    expect(result.current.secondsLeft).toBe(60);
  });

  it('counts the seconds down as time passes', () => {
    const { result } = renderHook(() => useCountdown(ONE_MINUTE_MS));

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.secondsLeft).toBe(59);

    act(() => {
      vi.advanceTimersByTime(58_000);
    });
    expect(result.current.secondsLeft).toBe(1);
  });

  it('settles at zero and stays there', () => {
    const { result } = renderHook(() => useCountdown(ONE_MINUTE_MS));

    act(() => {
      vi.advanceTimersByTime(ONE_MINUTE_MS + 5_000);
    });

    expect(result.current.secondsLeft).toBe(0);
  });

  it('stops ticking once it has settled, instead of running on at 0', () => {
    renderHook(() => useCountdown(ONE_MINUTE_MS));

    act(() => {
      vi.advanceTimersByTime(ONE_MINUTE_MS);
    });

    // The value settling at 0 does not imply the interval stopped: a 1 Hz
    // setState survives for as long as the dialog holding it stays open.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no interval behind when it unmounts mid-count', () => {
    const { unmount } = renderHook(() => useCountdown(ONE_MINUTE_MS));

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts a spent countdown at the full duration', () => {
    const { result } = renderHook(() => useCountdown(ONE_MINUTE_MS));

    act(() => {
      vi.advanceTimersByTime(ONE_MINUTE_MS);
    });
    expect(result.current.secondsLeft).toBe(0);

    act(() => {
      result.current.restart();
    });
    expect(result.current.secondsLeft).toBe(60);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.secondsLeft).toBe(59);
  });

  it('starts free when no cooldown is running yet, and holds once restarted', () => {
    const { result } = renderHook(() =>
      useCountdown(ONE_MINUTE_MS, { startHeld: false })
    );

    expect(result.current.secondsLeft).toBe(0);

    act(() => {
      result.current.restart();
    });
    expect(result.current.secondsLeft).toBe(60);
  });
});
