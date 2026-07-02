import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { inArray } from 'drizzle-orm';
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

describe.runIf(DB_AVAILABLE)('createOidcProvider dynamic registration', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let server: Server;
  let baseUrl: string;

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
    await db
      .delete(oauthPayloads)
      .where(
        inArray(oauthPayloads.model, ['Client', 'RegistrationAccessToken'])
      );
    await moduleRef.close();
  });

  it('should register a public client applying clientDefaults', async () => {
    const response = await fetch(`${baseUrl}/reg`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://client.example.com/callback'],
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(body['client_id']).toBeTypeOf('string');
    expect(body['token_endpoint_auth_method']).toBe('none');
    expect(body['grant_types']).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
    expect(body['response_types']).toEqual(['code']);
  });
});
