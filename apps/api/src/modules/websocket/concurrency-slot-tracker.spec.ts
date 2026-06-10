import { describe, expect, it } from 'vitest';

import { ConcurrencySlotTracker } from './concurrency-slot-tracker';

describe('ConcurrencySlotTracker', () => {
  it('acquires slots up to the per-user limit and rejects beyond it', () => {
    const tracker = new ConcurrencySlotTracker(2);

    expect(tracker.acquire('u1', 'c1', 's1', new AbortController())).toBe(true);
    expect(tracker.acquire('u1', 'c1', 's2', new AbortController())).toBe(true);
    expect(tracker.acquire('u1', 'c2', 's3', new AbortController())).toBe(
      false
    );
    expect(tracker.acquire('u2', 'c3', 's4', new AbortController())).toBe(true);
  });

  it('frees the slot on release so a new acquire succeeds', () => {
    const tracker = new ConcurrencySlotTracker(1);

    expect(tracker.acquire('u1', 'c1', 's1', new AbortController())).toBe(true);
    tracker.release('u1', 'c1', 's1');
    expect(tracker.acquire('u1', 'c1', 's2', new AbortController())).toBe(true);
  });

  it('ignores a double release of the same slot', () => {
    const tracker = new ConcurrencySlotTracker(2);

    tracker.acquire('u1', 'c1', 's1', new AbortController());
    tracker.acquire('u1', 'c1', 's2', new AbortController());
    tracker.release('u1', 'c1', 's1');
    tracker.release('u1', 'c1', 's1');

    expect(tracker.acquire('u1', 'c1', 's3', new AbortController())).toBe(true);
    expect(tracker.acquire('u1', 'c1', 's4', new AbortController())).toBe(
      false
    );
  });

  it("aborts only the given client's controllers", () => {
    const tracker = new ConcurrencySlotTracker(5);
    const a = new AbortController();
    const b = new AbortController();
    tracker.acquire('u1', 'c1', 's1', a);
    tracker.acquire('u2', 'c2', 's2', b);

    tracker.abortAllForClient('c1');

    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
  });

  it('keeps the aborted slot counted until released, then frees it', () => {
    const tracker = new ConcurrencySlotTracker(1);
    const a = new AbortController();
    tracker.acquire('u1', 'c1', 's1', a);

    tracker.abortAllForClient('c1');
    expect(tracker.acquire('u1', 'c1', 's2', new AbortController())).toBe(
      false
    );

    tracker.release('u1', 'c1', 's1');
    expect(tracker.hasActiveSlots('c1')).toBe(false);
    expect(tracker.acquire('u1', 'c1', 's3', new AbortController())).toBe(true);
  });

  it('reports active slots per client', () => {
    const tracker = new ConcurrencySlotTracker(2);
    expect(tracker.hasActiveSlots('c1')).toBe(false);

    tracker.acquire('u1', 'c1', 's1', new AbortController());
    expect(tracker.hasActiveSlots('c1')).toBe(true);
    expect(tracker.hasActiveSlots('c2')).toBe(false);
  });
});
