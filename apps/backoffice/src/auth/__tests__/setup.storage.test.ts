import { afterEach, describe, expect, it, vi } from 'vitest';

import { authStore } from '../setup';

describe('authStore when the browser refuses storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still signs the admin out', () => {
    authStore.getState().setUser({
      id: 'u1',
      email: 'admin@knowtis.local',
      name: 'Admin',
      avatarUrl: null,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    });

    authStore.getState().logout();

    expect(authStore.getState().isAuthenticated).toBe(false);
  });
});
