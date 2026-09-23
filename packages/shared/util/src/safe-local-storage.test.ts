import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { safeLocalStorage as SafeLocalStorage } from './safe-local-storage';

const KEY = 'k';

function refusingStorage(): Storage {
  const refuse = () => {
    throw new DOMException('full', 'QuotaExceededError');
  };
  return {
    length: 0,
    clear: refuse,
    key: refuse,
    getItem: refuse,
    setItem: refuse,
    removeItem: refuse,
  };
}

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

describe('safeLocalStorage', () => {
  let storage: typeof SafeLocalStorage;

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    ({ safeLocalStorage: storage } = await import('./safe-local-storage'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads back what it wrote', () => {
    vi.stubGlobal('localStorage', memoryStorage());

    storage.setItem(KEY, 'v');

    expect(storage.getItem(KEY)).toBe('v');
  });

  it('forgets what it removed', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    storage.setItem(KEY, 'v');

    storage.removeItem(KEY);

    expect(storage.getItem(KEY)).toBeNull();
  });

  it('reads nothing and drops writes when the browser refuses storage', () => {
    vi.stubGlobal('localStorage', refusingStorage());

    storage.setItem(KEY, 'v');
    storage.removeItem(KEY);

    expect(storage.getItem(KEY)).toBeNull();
  });

  it('works without any localStorage at all', () => {
    vi.stubGlobal('localStorage', null);

    storage.setItem(KEY, 'v');
    storage.removeItem(KEY);

    expect(storage.getItem(KEY)).toBeNull();
  });

  it('warns once per kind of failure, not once per call', () => {
    vi.stubGlobal('localStorage', refusingStorage());

    storage.setItem(KEY, 'a');
    storage.setItem(KEY, 'b');
    storage.getItem(KEY);

    expect(vi.mocked(console.warn).mock.calls.map((call) => call[1])).toEqual([
      'localStorage write failed',
      'localStorage read failed',
    ]);
  });
});
