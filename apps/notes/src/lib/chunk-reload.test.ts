import { refuseStorage } from '@/test/refuse-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reloadIfStaleChunk } from './chunk-reload';

describe('reloadIfStaleChunk', () => {
  const originalLocation = window.location;
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('reloads once, then holds off while that reload is recent', () => {
    expect([reloadIfStaleChunk(), reloadIfStaleChunk()]).toEqual([true, false]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the browser refuses session storage', () => {
    refuseStorage();

    expect(reloadIfStaleChunk()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('never reloads on repeated chunk failures when the reload stamp does not persist', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);

    expect([
      reloadIfStaleChunk(),
      reloadIfStaleChunk(),
      reloadIfStaleChunk(),
    ]).toEqual([false, false, false]);
    expect(reload).not.toHaveBeenCalled();
  });
});
