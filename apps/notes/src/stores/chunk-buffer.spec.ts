import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChunkBuffer } from './chunk-buffer';

const FLUSH_MS = 50;
const INACTIVITY_MS = 1000;

function makeBuffer() {
  const onFlush = vi.fn();
  const onInactivity = vi.fn();
  const buffer = createChunkBuffer({
    flushMs: FLUSH_MS,
    inactivityMs: INACTIVITY_MS,
    onFlush,
    onInactivity,
  });
  return { buffer, onFlush, onInactivity };
}

describe('createChunkBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('batches pushed text into a single flush after flushMs', () => {
    const { buffer, onFlush } = makeBuffer();
    buffer.push('Hel');
    buffer.push('lo');
    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FLUSH_MS);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('Hello');
  });

  it('flush() delivers buffered text immediately and cancels the pending timer', () => {
    const { buffer, onFlush } = makeBuffer();
    buffer.push('now');
    buffer.flush();
    expect(onFlush).toHaveBeenCalledWith('now');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('flush() does nothing when the buffer is empty', () => {
    const { buffer, onFlush } = makeBuffer();
    buffer.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('discard drops buffered text without flushing', () => {
    const { buffer, onFlush } = makeBuffer();
    buffer.push('dropped');
    buffer.discard();
    vi.advanceTimersByTime(FLUSH_MS);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('fires onInactivity after inactivityMs, flushing buffered text first', () => {
    const { buffer, onFlush, onInactivity } = makeBuffer();
    const order: string[] = [];
    onFlush.mockImplementation(() => order.push('flush'));
    onInactivity.mockImplementation(() => order.push('inactivity'));
    buffer.push('tail');
    vi.advanceTimersByTime(INACTIVITY_MS);
    expect(order).toEqual(['flush', 'inactivity']);
  });

  it('push re-arms the inactivity timer', () => {
    const { buffer, onInactivity } = makeBuffer();
    buffer.armInactivityTimer();
    vi.advanceTimersByTime(INACTIVITY_MS - 1);
    buffer.push('x');
    vi.advanceTimersByTime(INACTIVITY_MS - 1);
    expect(onInactivity).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onInactivity).toHaveBeenCalledTimes(1);
  });

  it('clearInactivityTimer prevents the inactivity callback', () => {
    const { buffer, onInactivity } = makeBuffer();
    buffer.armInactivityTimer();
    buffer.clearInactivityTimer();
    vi.advanceTimersByTime(INACTIVITY_MS);
    expect(onInactivity).not.toHaveBeenCalled();
  });
});
