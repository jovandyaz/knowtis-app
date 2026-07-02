import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TokenCache } from '../auth/token-cache.js';

describe('TokenCache', () => {
  let cache: TokenCache;

  beforeEach(() => {
    cache = new TokenCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve token', () => {
    cache.set('prefix1', {
      token: 'jwt1',
      scopes: 'notes:read',
      expiresAt: Date.now() + 60000,
    });
    const entry = cache.get('prefix1');
    expect(entry?.token).toBe('jwt1');
  });

  it('should return null for expired token', () => {
    cache.set('prefix1', {
      token: 'jwt1',
      scopes: 'notes:read',
      expiresAt: Date.now() + 1000,
    });
    vi.advanceTimersByTime(2000);
    expect(cache.get('prefix1')).toBeNull();
  });

  it('should return null for unknown prefix', () => {
    expect(cache.get('unknown')).toBeNull();
  });

  it('should invalidate a cached token', () => {
    cache.set('prefix1', {
      token: 'jwt1',
      scopes: 'notes:read',
      expiresAt: Date.now() + 60000,
    });
    cache.invalidate('prefix1');
    expect(cache.get('prefix1')).toBeNull();
  });
});
