import { createHash } from 'node:crypto';

import type { McpCredential } from './credentials.js';
import { TokenCache } from './token-cache.js';

const SCOPE_REQUIREMENTS: Record<string, readonly string[]> = {
  'list-notes': ['notes:read'],
  'get-note': ['notes:read'],
  'search-notes': ['notes:read'],
  'get-collaborators': ['notes:read'],
  'create-note': ['notes:write'],
  // A content update reads the stored note first, so it never drops what Markdown cannot show.
  'update-note': ['notes:read', 'notes:write'],
  'delete-note': ['notes:write'],
  'restore-note': ['notes:write'],
  'share-note': ['notes:share'],
  'note-resource': ['notes:read'],
};

export const NO_CREDENTIAL_MESSAGE =
  'No API key configured. Set KNOWTIS_API_KEY (stdio) or send an Authorization: Bearer header (HTTP).';

/**
 * Header naming the end client's address. The API buckets the token exchange
 * by it; over the private network nothing else carries the caller's IP, so
 * every hosted user would otherwise share the MCP instance's one bucket.
 */
export const REAL_IP_HEADER = 'x-real-ip';

const EXCHANGE_TIMEOUT_MS = 5_000;

/** The token exchange answered with a non-2xx `status`. */
export class TokenExchangeError extends Error {
  readonly status: number;
  readonly retryAfter: string | undefined;

  constructor(status: number, message: string, retryAfter?: string) {
    super(message);
    this.name = 'TokenExchangeError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export class InsufficientScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientScopeError';
  }
}

function assertScopes(
  granted: readonly string[],
  toolName: string,
  holder: string
): void {
  const missing = (SCOPE_REQUIREMENTS[toolName] ?? []).filter(
    (scope) => !granted.includes(scope)
  );
  if (missing.length > 0) {
    const named = missing.map((scope) => `'${scope}'`).join(' and ');
    const noun = missing.length === 1 ? 'scope' : 'scopes';
    throw new InsufficientScopeError(
      `${holder} does not have ${named} ${noun} required for tool '${toolName}'.`
    );
  }
}

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

  /**
   * JWT for `apiKey`, from cache or a fresh exchange. `clientIp` is forwarded
   * so the API rate-limits the end client, not this server. Throws
   * `TokenExchangeError` when the API rejects the key or the exchange.
   */
  async getToken(apiKey: string, clientIp?: string): Promise<string> {
    const cacheKey = this.cacheKey(apiKey);

    const cached = this.tokenCache.get(cacheKey);
    if (cached) {
      return cached.token;
    }

    const res = await fetch(this.tokenExchangeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(clientIp ? { [REAL_IP_HEADER]: clientIp } : {}),
      },
      body: JSON.stringify({ apiKey }),
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new TokenExchangeError(
        res.status,
        `Authentication failed: ${(body as Record<string, string>).message ?? res.statusText}`,
        res.headers.get('retry-after') ?? undefined
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
    }
    assertScopes(cached.scopes.split(','), toolName, 'API key');
  }

  checkScopes(scopes: string[], toolName: string): void {
    assertScopes(scopes, toolName, 'Access token');
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
    throw new Error(NO_CREDENTIAL_MESSAGE);
  }
  if (credential.kind === 'api-key') {
    const token = await authService.getToken(
      credential.apiKey,
      credential.clientIp
    );
    authService.checkScope(credential.apiKey, action);
    return token;
  }
  authService.checkScopes(credential.scopes, action);
  return credential.jwt;
}
