interface CacheEntry {
  token: string;
  scopes: string;
  expiresAt: number; // Unix timestamp ms
}

export class TokenCache {
  private cache = new Map<string, CacheEntry>();

  set(key: string, entry: CacheEntry): void {
    this.cache.set(key, entry);
  }

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }
}
