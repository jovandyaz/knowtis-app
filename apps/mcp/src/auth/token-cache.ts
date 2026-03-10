interface CacheEntry {
  token: string;
  scopes: string;
  expiresAt: number; // Unix timestamp ms
}

export class TokenCache {
  private cache = new Map<string, CacheEntry>();

  set(keyPrefix: string, entry: CacheEntry): void {
    this.cache.set(keyPrefix, entry);
  }

  get(keyPrefix: string): CacheEntry | null {
    const entry = this.cache.get(keyPrefix);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(keyPrefix);
      return null;
    }
    return entry;
  }

  invalidate(keyPrefix: string): void {
    this.cache.delete(keyPrefix);
  }
}
