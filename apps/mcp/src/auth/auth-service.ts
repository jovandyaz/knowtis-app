import { createHash } from 'node:crypto';

import type { McpCredential } from './credentials.js';
import { TokenCache } from './token-cache.js';

const SCOPE_REQUIREMENTS: Record<string, string> = {
  'list-notes': 'notes:read',
  'get-note': 'notes:read',
  'search-notes': 'notes:read',
  'get-collaborators': 'notes:read',
  'create-note': 'notes:write',
  'update-note': 'notes:write',
  'delete-note': 'notes:write',
  'share-note': 'notes:share',
  'note-resource': 'notes:read',
};

export class AuthService {
  private tokenCache: TokenCache;
  private tokenExchangeUrl: string;

  constructor(tokenExchangeUrl: string) {
    this.tokenExchangeUrl = tokenExchangeUrl;
    this.tokenCache = new TokenCache();
  }

  private cacheKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  async getToken(apiKey: string): Promise<string> {
    const cacheKey = this.cacheKey(apiKey);

    const cached = this.tokenCache.get(cacheKey);
    if (cached) {
      return cached.token;
    }

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

    this.tokenCache.set(cacheKey, {
      token: data.accessToken,
      scopes: data.scopes,
      expiresAt: Date.now() + (data.expiresIn - 60) * 1000,
    });

    return data.accessToken;
  }

  checkScope(apiKey: string, toolName: string): void {
    const cached = this.tokenCache.get(this.cacheKey(apiKey));
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

  checkScopes(scopes: string[], toolName: string): void {
    const required = SCOPE_REQUIREMENTS[toolName];
    if (!required) {
      return;
    }
    if (!scopes.includes(required)) {
      throw new Error(
        `Access token does not have '${required}' scope required for tool '${toolName}'.`
      );
    }
  }
}

/**
 * Resolves a bearer token for the given action, enforcing scope on the passed
 * AuthService instance. api-key credentials exchange + scope-check; oauth
 * credentials scope-check the presented JWT. Throws a plain Error when no
 * credential is present — callers wrap it in their own error strategy.
 */
export async function resolveCredentialToken(
  authService: AuthService,
  credential: McpCredential | undefined,
  action: string
): Promise<string> {
  if (!credential) {
    throw new Error(
      'No API key configured. Set KNOWTIS_API_KEY (stdio) or send an Authorization: Bearer header (HTTP).'
    );
  }
  if (credential.kind === 'api-key') {
    const token = await authService.getToken(credential.apiKey);
    authService.checkScope(credential.apiKey, action);
    return token;
  }
  authService.checkScopes(credential.scopes, action);
  return credential.jwt;
}
