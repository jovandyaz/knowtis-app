import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SocketExpiryTimers, TOKEN_EXPIRY_GRACE_MS } from './socket-expiry';

describe('SocketExpiryTimers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onExpire once the token expiry plus grace period passes', () => {
    const timers = new SocketExpiryTimers();
    const onExpire = vi.fn();

    timers.arm('client-1', Date.now() + 1000, onExpire);

    vi.advanceTimersByTime(999 + TOKEN_EXPIRY_GRACE_MS);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('fires immediately for already-expired tokens', () => {
    const timers = new SocketExpiryTimers();
    const onExpire = vi.fn();

    timers.arm('client-1', Date.now() - 60_000, onExpire);
    vi.advanceTimersByTime(0);

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not fire after clear', () => {
    const timers = new SocketExpiryTimers();
    const onExpire = vi.fn();

    timers.arm('client-1', Date.now() + 1000, onExpire);
    timers.clear('client-1');

    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('replaces a previous timer for the same client', () => {
    const timers = new SocketExpiryTimers();
    const first = vi.fn();
    const second = vi.fn();

    timers.arm('client-1', Date.now() + 1000, first);
    timers.arm('client-1', Date.now() + 5000, second);

    vi.advanceTimersByTime(60_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('skips arming when the delay exceeds the 32-bit timer limit', () => {
    const timers = new SocketExpiryTimers();
    const onExpire = vi.fn();

    timers.arm('client-1', Date.now() + 40 * 24 * 60 * 60 * 1000, onExpire);

    expect(vi.getTimerCount()).toBe(0);
  });
});
