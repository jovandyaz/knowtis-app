import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SafeStorageModule from './safe-storage';

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

describe.each([
  { global: 'localStorage', guarded: 'safeLocalStorage' },
  { global: 'sessionStorage', guarded: 'safeSessionStorage' },
] as const)('$guarded', ({ global, guarded }) => {
  let storage: (typeof SafeStorageModule)[typeof guarded];

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    storage = (await import('./safe-storage'))[guarded];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads back what it wrote', () => {
    vi.stubGlobal(global, memoryStorage());

    storage.setItem(KEY, 'v');

    expect(storage.getItem(KEY)).toBe('v');
  });

  it('forgets what it removed', () => {
    vi.stubGlobal(global, memoryStorage());
    storage.setItem(KEY, 'v');

    storage.removeItem(KEY);

    expect(storage.getItem(KEY)).toBeNull();
  });

  it('reads nothing and drops writes when the browser refuses storage', () => {
    vi.stubGlobal(global, refusingStorage());

    storage.setItem(KEY, 'v');
    storage.removeItem(KEY);

    expect(storage.getItem(KEY)).toBeNull();
  });

  it('works without the storage at all', () => {
    vi.stubGlobal(global, null);

    storage.setItem(KEY, 'v');
    storage.removeItem(KEY);

    expect(storage.getItem(KEY)).toBeNull();
  });

  it('warns once per kind of failure, not once per call', () => {
    vi.stubGlobal(global, refusingStorage());

    storage.setItem(KEY, 'a');
    storage.setItem(KEY, 'b');
    storage.getItem(KEY);

    expect(vi.mocked(console.warn).mock.calls.map((call) => call[1])).toEqual([
      `${global} write failed`,
      `${global} read failed`,
    ]);
  });
});
