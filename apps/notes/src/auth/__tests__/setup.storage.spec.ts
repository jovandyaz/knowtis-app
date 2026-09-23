import { refuseStorageWrites } from '@/test/refuse-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authStore } from '../setup';

describe('authStore when the browser refuses storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still signs the user out', () => {
    authStore.getState().setUser({
      id: 'u1',
      email: 'u1@knowtis.local',
      name: 'U1',
      avatarUrl: null,
    });
    refuseStorageWrites();

    authStore.getState().logout();

    expect(authStore.getState().isAuthenticated).toBe(false);
  });
});
