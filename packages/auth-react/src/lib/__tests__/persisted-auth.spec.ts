import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readPersistedAuth } from '../store/persisted-auth';

const KEY = 'test-auth-store';

describe('readPersistedAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns null when the storage key is absent', () => {
    expect(readPersistedAuth(KEY)).toBeNull();
  });

  it('returns null when the stored value is malformed JSON', () => {
    localStorage.setItem(KEY, '{not-json');
    expect(readPersistedAuth(KEY)).toBeNull();
  });

  it('returns the parsed snapshot when the shape matches', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          user: {
            id: 'user-1',
            email: 'a@b.com',
            name: 'Alice',
            avatarUrl: null,
            isAnonymous: false,
          },
          isAuthenticated: true,
        },
        version: 0,
      })
    );

    const snapshot = readPersistedAuth(KEY);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.isAuthenticated).toBe(true);
    expect(snapshot?.user).toMatchObject({
      id: 'user-1',
      isAnonymous: false,
    });
  });

  it('returns a snapshot with user=null when the persisted user is null', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: { user: null, isAuthenticated: false },
        version: 0,
      })
    );

    const snapshot = readPersistedAuth(KEY);

    expect(snapshot).toEqual({ user: null, isAuthenticated: false });
  });

  it('returns null and warns when the persisted shape does not match', () => {
    localStorage.setItem(KEY, JSON.stringify({ broken: true }));
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const snapshot = readPersistedAuth(KEY);

    expect(snapshot).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[auth-react] Persisted auth schema mismatch'),
      expect.any(Array)
    );
  });

  it('accepts and ignores unknown fields inside user and state (passthrough)', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          user: { id: 'u', isAnonymous: true, futureField: 'ok' },
          isAuthenticated: true,
          extraStateField: 42,
        },
        version: 1,
        topLevelExtra: 'x',
      })
    );

    const snapshot = readPersistedAuth(KEY);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.user).toMatchObject({ id: 'u', isAnonymous: true });
  });
});
