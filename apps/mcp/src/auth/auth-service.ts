import { TokenCache } from './token-cache.js';

const SCOPE_REQUIREMENTS: Record<string, string> = {
  'list-notes': 'read',
  'get-note': 'read',
  'get-collaborators': 'read',
  'create-note': 'write',
  'update-note': 'write',
  'delete-note': 'write',
  'share-note': 'share',
};

export class AuthService {
  private tokenCache: TokenCache;
  private tokenExchangeUrl: string;

  constructor(tokenExchangeUrl: string) {
    this.tokenExchangeUrl = tokenExchangeUrl;
    this.tokenCache = new TokenCache();
  }

  async getToken(apiKey: string): Promise<string> {
    const prefix = apiKey.slice(0, 24);

    // Check cache first
    const cached = this.tokenCache.get(prefix);
    if (cached) {
      return cached.token;
    }

    // Exchange API key for JWT
    const res = await fetch(this.tokenExchangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        `Authentication failed: ${(body as Record<string, string>).message ?? res.statusText}`
      );
    }

    const data = (await res.json()) as {
      accessToken: string;
      expiresIn: number;
      scopes: string;
    };

    // Cache with 1 minute buffer before actual expiry
    this.tokenCache.set(prefix, {
      token: data.accessToken,
      scopes: data.scopes,
      expiresAt: Date.now() + (data.expiresIn - 60) * 1000,
    });

    return data.accessToken;
  }

  checkScope(apiKey: string, toolName: string): void {
    const prefix = apiKey.slice(0, 24);
    const cached = this.tokenCache.get(prefix);
    if (!cached) {
      return;
    } // Will fail at token exchange

    const required = SCOPE_REQUIREMENTS[toolName];
    if (!required) {
      return;
    }

    const scopes = cached.scopes.split(',');
    if (!scopes.includes(required)) {
      throw new Error(
        `API key does not have '${required}' scope required for tool '${toolName}'.`
      );
    }
  }
}
