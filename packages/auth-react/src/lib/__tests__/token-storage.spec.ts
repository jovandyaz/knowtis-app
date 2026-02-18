import { createTokenStorage } from '../storage/token-storage';

describe('createTokenStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should start with no tokens', () => {
    const storage = createTokenStorage();
    expect(storage.getAccessToken()).toBeNull();
    expect(storage.getRefreshToken()).toBeNull();
    expect(storage.hasTokens()).toBe(false);
  });

  it('should set and get access token in memory', () => {
    const storage = createTokenStorage();
    storage.setAccessToken('access-123');
    expect(storage.getAccessToken()).toBe('access-123');
    expect(storage.hasTokens()).toBe(true);
  });

  it('should set and get refresh token in localStorage', () => {
    const storage = createTokenStorage({ refreshTokenKey: 'test_refresh' });
    storage.setRefreshToken('refresh-456');
    expect(storage.getRefreshToken()).toBe('refresh-456');
    expect(localStorage.getItem('test_refresh')).toBe('refresh-456');
  });

  it('should set both tokens with setTokens', () => {
    const storage = createTokenStorage({ refreshTokenKey: 'test_refresh' });
    storage.setTokens('access-123', 'refresh-456');
    expect(storage.getAccessToken()).toBe('access-123');
    expect(storage.getRefreshToken()).toBe('refresh-456');
  });

  it('should clear all tokens', () => {
    const storage = createTokenStorage({ refreshTokenKey: 'test_refresh' });
    storage.setTokens('access-123', 'refresh-456');
    storage.clearTokens();
    expect(storage.getAccessToken()).toBeNull();
    expect(storage.getRefreshToken()).toBeNull();
    expect(storage.hasTokens()).toBe(false);
  });

  it('should notify subscribers when access token changes', () => {
    const storage = createTokenStorage();
    const callback = vi.fn();

    storage.subscribe(callback);
    storage.setAccessToken('token-1');

    expect(callback).toHaveBeenCalledWith(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should notify with false when access token is cleared', () => {
    const storage = createTokenStorage();
    const callback = vi.fn();

    storage.setAccessToken('token-1');
    storage.subscribe(callback);
    storage.setAccessToken(null);

    expect(callback).toHaveBeenCalledWith(false);
  });

  it('should unsubscribe correctly', () => {
    const storage = createTokenStorage();
    const callback = vi.fn();

    const unsubscribe = storage.subscribe(callback);
    unsubscribe();
    storage.setAccessToken('token-1');

    expect(callback).not.toHaveBeenCalled();
  });

  it('should initialize and detect refresh token', () => {
    const storage = createTokenStorage({ refreshTokenKey: 'test_refresh' });
    storage.setRefreshToken('refresh-token');

    const result = storage.initialize();
    expect(result.hasRefreshToken).toBe(true);
  });

  it('should initialize with no refresh token', () => {
    const storage = createTokenStorage();
    const result = storage.initialize();
    expect(result.hasRefreshToken).toBe(false);
  });

  it('should use default refresh token key', () => {
    const storage = createTokenStorage();
    storage.setRefreshToken('refresh-token');
    expect(localStorage.getItem('auth_refresh_token')).toBe('refresh-token');
  });
});
