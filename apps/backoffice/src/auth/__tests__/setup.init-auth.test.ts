import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshToken, getProfile, logout } = vi.hoisted(() => ({
  refreshToken: vi.fn(),
  getProfile: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../auth-api-adapter', () => ({
  createBackofficeAuthApi: () => ({
    login: vi.fn(),
    logout,
    refreshToken,
    getProfile,
  }),
}));

import { authStore, initAuth, tokenStorage } from '../setup';

const profile = {
  id: 'u1',
  email: 'admin@knowtis.local',
  name: 'Admin',
  avatarUrl: null,
  role: 'admin' as const,
};

describe('initAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStore.getState().logout();
    tokenStorage.clearTokens();
  });

  it('skips the refresh entirely on a cold boot without a prior session', async () => {
    await initAuth();

    expect(refreshToken).not.toHaveBeenCalled();
    expect(getProfile).not.toHaveBeenCalled();
    expect(authStore.getState().isAuthenticated).toBe(false);
  });

  it('refreshes and syncs the profile when a persisted session exists', async () => {
    authStore.getState().setUser(profile);
    refreshToken.mockResolvedValue({ accessToken: 't' });
    getProfile.mockResolvedValue(profile);

    await initAuth();

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(authStore.getState().user).toEqual(profile);
  });

  it('skips the refresh but still syncs the profile when an access token is already in memory', async () => {
    authStore.getState().setUser(profile);
    tokenStorage.setAccessToken('live-token');
    getProfile.mockResolvedValue(profile);

    await initAuth();

    expect(refreshToken).not.toHaveBeenCalled();
    expect(getProfile).toHaveBeenCalledTimes(1);
  });

  it('logs out when the silent refresh fails for a persisted session', async () => {
    authStore.getState().setUser(profile);
    refreshToken.mockRejectedValue(new Error('400 refresh'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await initAuth();

    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(authStore.getState().user).toBeNull();
    warn.mockRestore();
  });
});
