import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  oauthPayloads,
  type Database,
} from '../../../database';
import {
  createOidcProvider,
  hasRejectedOfflineAccess,
  refreshTokenTtl,
  shouldIssueRefreshToken,
  type OidcProviderHandle,
} from '../oidc-provider.factory';

loadEnv({ path: ['.env.local', '.env'] });
const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();

const ISSUER = 'https://auth.knowtis.test';
const RESOURCE_URL = 'https://mcp.knowtis.test/mcp';
const FRONTEND_URL = 'https://app.knowtis.test';

async function generateTestJwks(): Promise<{
  keys: Record<string, unknown>[];
}> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = 'test-es256';
  jwk.alg = 'ES256';
  jwk.use = 'sig';
  return { keys: [jwk as Record<string, unknown>] };
}

async function startServer(
  handle: OidcProviderHandle
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(handle.callback);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe('createOidcProvider', () => {
  let server: Server;
  let discovery: Record<string, unknown>;

  beforeAll(async () => {
    const handle = await createOidcProvider({
      db: {} as Database,
      issuer: ISSUER,
      jwks: await generateTestJwks(),
      cookieKeys: ['test-cookie-secret'],
      resourceUrl: RESOURCE_URL,
      frontendUrl: FRONTEND_URL,
    });
    const started = await startServer(handle);
    server = started.server;
    const response = await fetch(
      `${started.baseUrl}/.well-known/oauth-authorization-server`
    );
    expect(response.status).toBe(200);
    discovery = (await response.json()) as Record<string, unknown>;
  });

  afterAll(async () => {
    server?.close();
  });

  it('should configure PKCE S256, CIMD, resource indicators and none auth', () => {
    expect(discovery['code_challenge_methods_supported']).toEqual(['S256']);
    expect(discovery['client_id_metadata_document_supported']).toBe(true);
    expect(discovery['token_endpoint_auth_methods_supported']).toContain(
      'none'
    );
    expect(discovery['grant_types_supported']).toEqual(
      expect.arrayContaining(['authorization_code', 'refresh_token'])
    );
  });

  it('should advertise issuer, notes scopes, and code-only response types', () => {
    expect(discovery['issuer']).toBe(ISSUER);
    expect(discovery['scopes_supported']).toEqual(
      expect.arrayContaining([
        'notes:read',
        'notes:write',
        'notes:share',
        'offline_access',
      ])
    );
    expect(discovery['response_types_supported']).toEqual(['code']);
  });

  it('should expose registration and revocation endpoints and sign with ES256', () => {
    expect(discovery['registration_endpoint']).toMatch(/\/reg$/);
    expect(discovery['revocation_endpoint']).toMatch(/\/token\/revocation$/);
    expect(discovery['id_token_signing_alg_values_supported']).toContain(
      'ES256'
    );
  });
});

describe('refreshTokenTtl', () => {
  it('should grant a 30d window to URL (remote CIMD) client_ids', () => {
    expect(refreshTokenTtl({ clientId: 'https://client.example.com' })).toBe(
      2592000
    );
  });

  it('should grant a 90d window to opaque (locally registered) client_ids', () => {
    expect(refreshTokenTtl({ clientId: 'abc123' })).toBe(7776000);
  });

  it('should treat any http-prefixed client_id as remote, even non-URLs', () => {
    expect(refreshTokenTtl({ clientId: 'httpfoo' })).toBe(2592000);
  });

  it('should treat an empty client_id as locally registered', () => {
    expect(refreshTokenTtl({ clientId: '' })).toBe(7776000);
  });
});

describe('shouldIssueRefreshToken', () => {
  const allowingClient = { grantTypeAllowed: () => true };
  const denyingClient = { grantTypeAllowed: () => false };
  const publicWebClient = {
    grantTypeAllowed: () => true,
    applicationType: 'web',
    clientAuthMethod: 'none',
  };
  const confidentialClient = {
    grantTypeAllowed: () => true,
    applicationType: 'web',
    clientAuthMethod: 'client_secret_basic',
  };
  const offlineCode = { scopes: new Set(['notes:read', 'offline_access']) };
  const onlineCode = { scopes: new Set(['notes:read']) };

  it('should issue when refresh_token is allowed and offline_access is requested', () => {
    expect(shouldIssueRefreshToken(allowingClient, offlineCode, false)).toBe(
      true
    );
  });

  it('should not issue when offline_access is absent', () => {
    expect(shouldIssueRefreshToken(allowingClient, onlineCode, false)).toBe(
      false
    );
  });

  it('should not issue when the client cannot use the refresh_token grant', () => {
    expect(shouldIssueRefreshToken(denyingClient, offlineCode, false)).toBe(
      false
    );
  });

  it('should not issue when both the grant is denied and offline_access is absent', () => {
    expect(shouldIssueRefreshToken(denyingClient, onlineCode, false)).toBe(
      false
    );
  });

  it('should issue to a public web client (auth method none) when offline_access was stripped by the AS', () => {
    expect(shouldIssueRefreshToken(publicWebClient, onlineCode, false)).toBe(
      true
    );
  });

  it('should not issue to a public web client that explicitly rejected offline_access on its grant', () => {
    expect(shouldIssueRefreshToken(publicWebClient, onlineCode, true)).toBe(
      false
    );
  });

  it('should still issue to a public web client when an unrelated scope was rejected but offline_access was not', () => {
    expect(shouldIssueRefreshToken(publicWebClient, onlineCode, false)).toBe(
      true
    );
  });

  it('should not issue to a confidential client when offline_access is absent', () => {
    expect(shouldIssueRefreshToken(confidentialClient, onlineCode, false)).toBe(
      false
    );
  });

  it('should not issue to a public web client that cannot use the refresh_token grant', () => {
    expect(
      shouldIssueRefreshToken(
        {
          grantTypeAllowed: () => false,
          applicationType: 'web',
          clientAuthMethod: 'none',
        },
        onlineCode,
        false
      )
    ).toBe(false);
  });
});

describe('hasRejectedOfflineAccess', () => {
  it('should report rejection when offline_access is in the grant rejected OIDC scope', () => {
    expect(
      hasRejectedOfflineAccess({
        rejected: { openid: { scope: 'offline_access' } },
      })
    ).toBe(true);
  });

  it('should report rejection when offline_access sits among other rejected scopes', () => {
    expect(
      hasRejectedOfflineAccess({
        rejected: { openid: { scope: 'notes:write offline_access' } },
      })
    ).toBe(true);
  });

  it('should not report rejection when only unrelated scopes were rejected', () => {
    expect(
      hasRejectedOfflineAccess({
        rejected: { openid: { scope: 'notes:write' } },
      })
    ).toBe(false);
  });

  it('should not report rejection when the grant has no rejected scopes', () => {
    expect(hasRejectedOfflineAccess({})).toBe(false);
  });

  it('should not report rejection when the grant is absent', () => {
    expect(hasRejectedOfflineAccess(undefined)).toBe(false);
  });
});

describe.runIf(DB_AVAILABLE)('createOidcProvider dynamic registration', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let server: Server;
  let baseUrl: string;
  const registeredClientIds: string[] = [];

  async function register(
    metadata: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${baseUrl}/reg`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    const body = (await response.json()) as Record<string, unknown>;
    const clientId = body['client_id'];
    if (typeof clientId === 'string') {
      registeredClientIds.push(clientId);
    }
    return body;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        DatabaseModule,
      ],
    }).compile();
    db = moduleRef.get<Database>(DATABASE_CONNECTION);

    const handle = await createOidcProvider({
      db,
      issuer: ISSUER,
      jwks: await generateTestJwks(),
      cookieKeys: ['test-cookie-secret'],
      resourceUrl: RESOURCE_URL,
      frontendUrl: FRONTEND_URL,
    });
    const started = await startServer(handle);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterAll(async () => {
    server?.close();
    if (registeredClientIds.length > 0) {
      await db
        .delete(oauthPayloads)
        .where(
          and(
            eq(oauthPayloads.model, 'Client'),
            inArray(oauthPayloads.id, registeredClientIds)
          )
        );
      await db
        .delete(oauthPayloads)
        .where(
          and(
            eq(oauthPayloads.model, 'RegistrationAccessToken'),
            inArray(
              sql`${oauthPayloads.payload}->>'clientId'`,
              registeredClientIds
            )
          )
        );
    }
    await moduleRef.close();
  });

  it('should register a public client applying clientDefaults', async () => {
    const body = await register({
      redirect_uris: ['https://client.example.com/callback'],
    });

    expect(body['client_id']).toBeTypeOf('string');
    expect(body['token_endpoint_auth_method']).toBe('none');
    expect(body['grant_types']).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
    expect(body['response_types']).toEqual(['code']);
  });

  it('should not issue a client_secret when auth method is explicitly none', async () => {
    const body = await register({
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'none',
    });

    expect(body['token_endpoint_auth_method']).toBe('none');
    expect(body['client_secret']).toBeUndefined();
  });

  it('should reject an authorization request that omits code_challenge (PKCE required)', async () => {
    const client = await register({
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'none',
    });
    const params = new URLSearchParams({
      client_id: client['client_id'] as string,
      response_type: 'code',
      redirect_uri: 'https://client.example.com/callback',
      scope: 'notes:read',
      state: 'xyz',
    });

    const response = await fetch(`${baseUrl}/auth?${params.toString()}`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(303);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('error=invalid_request');
    expect(location).toContain('PKCE');
  });
});
