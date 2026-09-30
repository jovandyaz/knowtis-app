import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConcurrencySlotTracker } from './concurrency-slot-tracker';
import {
  SHUTDOWN_ABORT_REASON,
  SHUTDOWN_DRAIN_TIMEOUT_MS,
  ShutdownDrain,
} from './shutdown-drain';

function holdSlot(tracker: ConcurrencySlotTracker, slotId: string) {
  const controller = new AbortController();
  tracker.acquire(slotId, slotId, slotId, controller);
  return controller;
}

describe('ShutdownDrain', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is not draining until the shutdown starts, then refuses from the first moment', () => {
    const drain = new ShutdownDrain();
    expect(drain.isDraining).toBe(false);

    void drain.beforeApplicationShutdown();

    expect(drain.isDraining).toBe(true);
  });

  it('aborts every registered source as a shutdown and resolves once all of them are idle', async () => {
    const drain = new ShutdownDrain();
    const agentTurns = new ConcurrencySlotTracker(2);
    const aiStreams = new ConcurrencySlotTracker(2);
    drain.register(agentTurns);
    drain.register(aiStreams);
    const turn = holdSlot(agentTurns, 't1');
    const stream = holdSlot(aiStreams, 's1');
    let drained = false;

    const draining = drain.beforeApplicationShutdown().then(() => {
      drained = true;
    });
    expect([turn.signal.reason, stream.signal.reason]).toEqual([
      SHUTDOWN_ABORT_REASON,
      SHUTDOWN_ABORT_REASON,
    ]);
    agentTurns.release('t1', 't1', 't1');
    await Promise.resolve();
    expect(drained).toBe(false);

    aiStreams.release('s1', 's1', 's1');
    await draining;

    expect(drained).toBe(true);
  });

  it('gives every source one shared deadline instead of one each', async () => {
    vi.useFakeTimers();
    const drain = new ShutdownDrain();
    const first = new ConcurrencySlotTracker(1);
    const second = new ConcurrencySlotTracker(1);
    drain.register(first);
    drain.register(second);
    holdSlot(first, 'a');
    holdSlot(second, 'b');
    let drained = false;

    const draining = drain.beforeApplicationShutdown().then(() => {
      drained = true;
    });
    await vi.advanceTimersByTimeAsync(SHUTDOWN_DRAIN_TIMEOUT_MS);

    expect(drained).toBe(true);
    await draining;
  });

  it('warns when the deadline passes with work still in flight', async () => {
    vi.useFakeTimers();
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const drain = new ShutdownDrain();
    const tracker = new ConcurrencySlotTracker(1);
    drain.register(tracker);
    holdSlot(tracker, 'a');

    const draining = drain.beforeApplicationShutdown();
    await vi.advanceTimersByTimeAsync(SHUTDOWN_DRAIN_TIMEOUT_MS);
    await draining;

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'shutdown.drained', drained: false })
    );
  });

  it('logs a drain that finished in time at info level', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    await new ShutdownDrain().beforeApplicationShutdown();

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'shutdown.drained', drained: true })
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
