import { createTokenStorage } from '../storage/token-storage';

describe('createTokenStorage', () => {
  it('should start with no tokens', () => {
    const storage = createTokenStorage();
    expect(storage.getAccessToken()).toBeNull();
    expect(storage.hasTokens()).toBe(false);
  });

  it('should set and get access token in memory', () => {
    const storage = createTokenStorage();
    storage.setAccessToken('access-123');
    expect(storage.getAccessToken()).toBe('access-123');
    expect(storage.hasTokens()).toBe(true);
  });

  it('should clear access token on clearTokens', () => {
    const storage = createTokenStorage();
    storage.setAccessToken('access-123');
    storage.clearTokens();
    expect(storage.getAccessToken()).toBeNull();
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

  describe('getExpiresAt', () => {
    function createJwt(expSeconds: number): string {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = btoa(JSON.stringify({ sub: '1', exp: expSeconds }));
      return `${header}.${body}.fake-signature`;
    }

    it('should return null when no token is set', () => {
      const storage = createTokenStorage();
      expect(storage.getExpiresAt()).toBeNull();
    });

    it('should return expiry in milliseconds from JWT', () => {
      const storage = createTokenStorage();
      const expSeconds = 1700000000;
      storage.setAccessToken(createJwt(expSeconds));

      expect(storage.getExpiresAt()).toBe(expSeconds * 1000);
    });

    it('should return null after clearTokens', () => {
      const storage = createTokenStorage();
      storage.setAccessToken(createJwt(1700000000));
      storage.clearTokens();

      expect(storage.getExpiresAt()).toBeNull();
    });

    it('should return null for non-JWT token', () => {
      const storage = createTokenStorage();
      storage.setAccessToken('not-a-jwt');

      expect(storage.getExpiresAt()).toBeNull();
    });
  });
});
