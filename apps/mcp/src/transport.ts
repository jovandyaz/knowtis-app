import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { REAL_IP_HEADER, TokenExchangeError } from './auth/auth-service.js';
import { classifyBearer, type McpCredential } from './auth/credentials.js';
import type { OauthVerifier } from './auth/oauth-verifier.js';
import type { AppConfig, OauthConfig } from './config.js';
import { log } from './middleware/logger.js';

const SUPPORTED_SCOPES = ['notes:read', 'notes:write', 'notes:share'] as const;

/**
 * Every scope a client should request. `offline_access` is advertised alongside
 * the resource scopes because a client copies these verbatim into its
 * authorization request; omitting it anywhere a client might read (the
 * `WWW-Authenticate` challenge OR the RFC 9728 Protected Resource Metadata)
 * mints a token with no refresh token, so the connection dies at the 1h access
 * token expiry. This is the single source for both discovery surfaces.
 */
const ADVERTISED_SCOPES = [...SUPPORTED_SCOPES, 'offline_access'] as const;

const CHALLENGE_SCOPE = ADVERTISED_SCOPES.join(' ');

const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVICE_UNAVAILABLE = 503;

/** Resolves when the API accepts `apiKey`; rejects with `TokenExchangeError` otherwise. */
export type ApiKeyVerifier = (
  apiKey: string,
  clientIp?: string
) => Promise<unknown>;

export function createApp(
  serverFactory: (credential: McpCredential) => McpServer,
  config: AppConfig,
  verifyApiKey: ApiKeyVerifier,
  oauthVerifier?: OauthVerifier
): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());

  app.use(
    '/mcp',
    cors({
      origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : '*',
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'Mcp-Session-Id',
        'MCP-Protocol-Version',
      ],
      exposeHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
    })
  );

  if (config.oauth) {
    const metadata = buildProtectedResourceMetadata(config.oauth);
    app.use('/.well-known/*', cors({ origin: '*' }));
    app.get('/.well-known/oauth-protected-resource', (c) => c.json(metadata));
    app.get('/.well-known/oauth-protected-resource/mcp', (c) =>
      c.json(metadata)
    );
  }

  app.get('/health', (c) =>
    c.json({ status: 'ok', version: config.serverVersion })
  );

  app.all('/mcp', async (c) => {
    const bearer = extractBearerToken(c.req.raw.headers);
    if (!bearer) {
      return c.json(
        {
          error: 'unauthorized',
          message:
            'Provide a Knowtis MCP API key or OAuth access token as a Bearer token. Create an API key in the Knowtis app under Settings > Integrations.',
        },
        HTTP_UNAUTHORIZED,
        { 'WWW-Authenticate': buildChallenge(config.oauth) }
      );
    }

    let credential: McpCredential;
    if (oauthVerifier && classifyBearer(bearer) === 'oauth') {
      try {
        const { scopes } = await oauthVerifier.verify(bearer);
        credential = { kind: 'oauth', jwt: bearer, scopes };
      } catch (error) {
        log({
          level: 'warn',
          event: 'token_verify_rejected',
          code:
            error && typeof error === 'object' && 'code' in error
              ? String((error as { code: unknown }).code)
              : 'unknown',
        });
        return c.json(
          {
            error: 'invalid_token',
            message: 'The access token is invalid or expired.',
          },
          HTTP_UNAUTHORIZED,
          { 'WWW-Authenticate': buildInvalidTokenChallenge(config.oauth) }
        );
      }
    } else {
      const clientIp = c.req.header(REAL_IP_HEADER) || undefined;
      try {
        await verifyApiKey(bearer, clientIp);
      } catch (error) {
        return rejectApiKey(error, config.oauth);
      }
      credential = {
        kind: 'api-key',
        apiKey: bearer,
        ...(clientIp ? { clientIp } : {}),
      };
    }

    const server = serverFactory(credential);
    const transport = new WebStandardStreamableHTTPServerTransport({
      allowedHosts: config.allowedHosts,
      allowedOrigins: config.allowedOrigins,
      enableDnsRebindingProtection: config.enableDnsRebindingProtection,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return app;
}

function rejectApiKey(error: unknown, oauth: OauthConfig | null): Response {
  const status = error instanceof TokenExchangeError ? error.status : undefined;
  log({
    level: 'warn',
    event: 'api_key_verify_rejected',
    status: status ?? 'unreachable',
  });
  if (status === HTTP_UNAUTHORIZED) {
    return Response.json(
      {
        error: 'invalid_token',
        message: 'The API key is invalid, expired or revoked.',
      },
      {
        status: HTTP_UNAUTHORIZED,
        headers: { 'WWW-Authenticate': buildInvalidTokenChallenge(oauth) },
      }
    );
  }
  if (status === HTTP_TOO_MANY_REQUESTS) {
    const retryAfter =
      error instanceof TokenExchangeError ? error.retryAfter : undefined;
    return Response.json(
      {
        error: 'rate_limited',
        message: 'Too many API key checks. Retry later.',
      },
      {
        status: HTTP_TOO_MANY_REQUESTS,
        headers: retryAfter ? { 'Retry-After': retryAfter } : {},
      }
    );
  }
  return Response.json(
    {
      error: 'temporarily_unavailable',
      message: 'The API key could not be checked. Retry later.',
    },
    { status: HTTP_SERVICE_UNAVAILABLE }
  );
}

function extractBearerToken(headers: Headers): string | undefined {
  const auth = headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return undefined;
  }
  return auth.slice(7);
}

function buildProtectedResourceMetadata(oauth: OauthConfig) {
  return {
    resource: oauth.resourceUrl,
    authorization_servers: [oauth.issuer],
    scopes_supported: ADVERTISED_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Knowtis MCP',
  };
}

function buildChallenge(oauth: OauthConfig | null): string {
  if (!oauth) {
    return 'Bearer realm="knowtis-mcp"';
  }
  return `Bearer resource_metadata="${oauth.metadataUrl}", scope="${CHALLENGE_SCOPE}"`;
}

function buildInvalidTokenChallenge(oauth: OauthConfig | null): string {
  return `${buildChallenge(oauth)}, error="invalid_token"`;
}
