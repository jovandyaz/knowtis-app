import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConcurrencySlotTracker } from './concurrency-slot-tracker';
import type { AuthenticatedSocket } from './socket-auth';
import {
  SocketExpiryTimers,
  SocketTokenExpiry,
  TOKEN_EXPIRY_GRACE_MS,
} from './socket-expiry';

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

describe('SocketTokenExpiry', () => {
  const PAST_EXPIRY_MS = 1_000 + TOKEN_EXPIRY_GRACE_MS;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const slots = new ConcurrencySlotTracker(2);
    const endSession = vi.fn();
    const logger = { log: vi.fn() };
    const expiry = new SocketTokenExpiry({
      slots,
      logger,
      deferredEvent: 'test.client.expiry_deferred',
      endSession,
    });
    const client = {
      id: 'client-1',
      data: { userId: 'user-1' },
    } as unknown as AuthenticatedSocket;
    return { slots, endSession, logger, expiry, client };
  }

  it('ends the session at expiry when the socket runs nothing', () => {
    const { endSession, expiry, client } = setup();

    expiry.arm(client, Date.now() + 1_000);
    vi.advanceTimersByTime(PAST_EXPIRY_MS);

    expect(endSession).toHaveBeenCalledOnce();
    expect(endSession).toHaveBeenCalledWith(client);
    expect(expiry.isExpired(client)).toBe(false);
  });

  it('lets running work finish, refuses new work, and ends the session once the last slot is released', () => {
    const { slots, endSession, logger, expiry, client } = setup();
    slots.acquire('user-1', 'client-1', 's1', new AbortController());
    slots.acquire('user-1', 'client-1', 's2', new AbortController());

    expiry.arm(client, Date.now() + 1_000);
    vi.advanceTimersByTime(PAST_EXPIRY_MS);

    expect(endSession).not.toHaveBeenCalled();
    expect(expiry.isExpired(client)).toBe(true);
    expect(logger.log).toHaveBeenCalledWith({
      event: 'test.client.expiry_deferred',
      clientId: 'client-1',
      userId: 'user-1',
    });

    slots.release('user-1', 'client-1', 's1');
    expiry.afterSlotRelease(client);
    expect(endSession).not.toHaveBeenCalled();

    slots.release('user-1', 'client-1', 's2');
    expiry.afterSlotRelease(client);
    expect(endSession).toHaveBeenCalledOnce();
    expect(expiry.isExpired(client)).toBe(false);
  });

  it('never ends the session of a socket whose token has not expired', () => {
    const { slots, endSession, expiry, client } = setup();
    slots.acquire('user-1', 'client-1', 's1', new AbortController());
    expiry.arm(client, Date.now() + 60_000);

    slots.release('user-1', 'client-1', 's1');
    expiry.afterSlotRelease(client);

    expect(endSession).not.toHaveBeenCalled();
  });

  it('forgets the timer and the expiry of a cleared socket', () => {
    const { slots, endSession, expiry, client } = setup();
    slots.acquire('user-1', 'client-1', 's1', new AbortController());
    expiry.arm(client, Date.now() + 1_000);
    vi.advanceTimersByTime(PAST_EXPIRY_MS);

    expiry.clear(client);
    slots.release('user-1', 'client-1', 's1');
    expiry.afterSlotRelease(client);

    expect(expiry.isExpired(client)).toBe(false);
    expect(endSession).not.toHaveBeenCalled();
  });

  function gated() {
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { done, finish };
  }

  it('waits for a request in flight that holds no slot yet, then ends the session once', async () => {
    const { endSession, expiry, client } = setup();
    const request = gated();
    expiry.arm(client, Date.now() + 1_000);

    const tracked = expiry.track(client, () => request.done);
    vi.advanceTimersByTime(PAST_EXPIRY_MS);

    expect(endSession).not.toHaveBeenCalled();
    expect(expiry.isExpired(client)).toBe(true);

    request.finish();
    await tracked;

    expect(endSession).toHaveBeenCalledOnce();
  });

  it('ends the session only when both the requests in flight and the slots are done', async () => {
    const { slots, endSession, expiry, client } = setup();
    const request = gated();
    slots.acquire('user-1', 'client-1', 's1', new AbortController());
    expiry.arm(client, Date.now() + 1_000);
    const tracked = expiry.track(client, () => request.done);
    vi.advanceTimersByTime(PAST_EXPIRY_MS);

    slots.release('user-1', 'client-1', 's1');
    expiry.afterSlotRelease(client);
    expect(endSession).not.toHaveBeenCalled();

    request.finish();
    await tracked;
    expect(endSession).toHaveBeenCalledOnce();
  });

  it('counts a failed request as finished and passes its error on', async () => {
    const { endSession, expiry, client } = setup();
    const failure = new Error('commit failed');
    let fail!: (error: Error) => void;
    const request = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    expiry.arm(client, Date.now() + 1_000);
    const tracked = expiry.track(client, () => request);
    vi.advanceTimersByTime(PAST_EXPIRY_MS);

    fail(failure);

    await expect(tracked).rejects.toBe(failure);
    expect(endSession).toHaveBeenCalledOnce();
  });
});
