import { Body, Controller, Post, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { exportJWK, generateKeyPair } from 'jose';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { Database } from '../../../database';
import { FeatureFlagsService } from '../../feature-flags';
import { OAUTH_PROVIDER } from '../oauth.module';
import {
  applyBodyParsersExcludingOauth,
  createOidcMount,
} from '../oidc-mount.middleware';
import {
  createOidcProvider,
  type OidcProviderHandle,
} from '../oidc-provider.factory';

const ISSUER = 'https://api.knowtis.app';
const PROXY_HEADERS = {
  'x-forwarded-proto': 'https',
  'x-forwarded-host': 'api.knowtis.app',
};

@Controller()
class EchoController {
  @Post('echo')
  echo(@Body() body: Record<string, unknown>): {
    received: Record<string, unknown>;
  } {
    return { received: body };
  }
}

async function generateTestJwks(): Promise<{
  keys: Record<string, unknown>[];
}> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = 'mount-test';
  jwk.alg = 'ES256';
  jwk.use = 'sig';
  return { keys: [jwk as Record<string, unknown>] };
}

interface Harness {
  app: NestExpressApplication;
  base: string;
  flags: { isEnabled: ReturnType<typeof vi.fn> };
}

async function buildHarness(
  handle: OidcProviderHandle | null
): Promise<Harness> {
  const flags = { isEnabled: vi.fn() };
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [EchoController],
    providers: [
      { provide: OAUTH_PROVIDER, useValue: handle },
      { provide: FeatureFlagsService, useValue: flags },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  app.set('trust proxy', 1);
  app.use(createOidcMount(app));
  applyBodyParsersExcludingOauth(app);
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });
  await app.listen(0, '127.0.0.1');
  return { app, base: await app.getUrl(), flags };
}

describe('OIDC mount (provider available)', () => {
  let harness: Harness;

  beforeAll(async () => {
    const handle = await createOidcProvider({
      db: {} as Database,
      issuer: ISSUER,
      jwks: await generateTestJwks(),
      cookieKeys: ['mount-test-secret'],
      resourceUrl: 'https://mcp.knowtis.app/mcp',
      frontendUrl: 'https://app.knowtis.app',
    });
    harness = await buildHarness(handle);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  beforeEach(() => {
    harness.flags.isEnabled.mockReset();
  });

  it('should 404 all oauth surfaces when mcp_oauth is off', async () => {
    harness.flags.isEnabled.mockResolvedValue(false);

    const discovery = await fetch(
      `${harness.base}/.well-known/oauth-authorization-server`,
      { headers: PROXY_HEADERS }
    );
    const jwks = await fetch(`${harness.base}/oauth/jwks`, {
      headers: PROXY_HEADERS,
    });

    expect(discovery.status).toBe(404);
    expect(jwks.status).toBe(404);
  });

  it('should serve discovery with S256, CIMD and none auth when the flag is on', async () => {
    harness.flags.isEnabled.mockResolvedValue(true);

    const res = await fetch(
      `${harness.base}/.well-known/oauth-authorization-server`,
      { headers: PROXY_HEADERS }
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body['issuer']).toBe(ISSUER);
    expect(body['code_challenge_methods_supported']).toEqual(['S256']);
    expect(body['client_id_metadata_document_supported']).toBe(true);
    expect(body['token_endpoint_auth_methods_supported']).toContain('none');
  });

  it('should serve the same discovery document at openid-configuration', async () => {
    harness.flags.isEnabled.mockResolvedValue(true);

    const res = await fetch(
      `${harness.base}/.well-known/openid-configuration`,
      { headers: PROXY_HEADERS }
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body['issuer']).toBe(ISSUER);
  });

  it('should advertise absolute /oauth-prefixed endpoint URLs in discovery', async () => {
    harness.flags.isEnabled.mockResolvedValue(true);

    const res = await fetch(
      `${harness.base}/.well-known/oauth-authorization-server`,
      { headers: PROXY_HEADERS }
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(body['authorization_endpoint']).toBe(`${ISSUER}/oauth/auth`);
    expect(body['token_endpoint']).toBe(`${ISSUER}/oauth/token`);
    expect(body['jwks_uri']).toBe(`${ISSUER}/oauth/jwks`);
    expect(body['registration_endpoint']).toBe(`${ISSUER}/oauth/reg`);
    expect(body['revocation_endpoint']).toBe(
      `${ISSUER}/oauth/token/revocation`
    );
  });

  it('should serve the JWKS document under /oauth when the flag is on', async () => {
    harness.flags.isEnabled.mockResolvedValue(true);

    const res = await fetch(`${harness.base}/oauth/jwks`, {
      headers: PROXY_HEADERS,
    });
    const body = (await res.json()) as { keys?: unknown[] };

    expect(res.status).toBe(200);
    expect(body.keys?.length).toBeGreaterThan(0);
  });

  it('should honour the flag per request without a restart', async () => {
    harness.flags.isEnabled.mockResolvedValue(false);
    const off = await fetch(
      `${harness.base}/.well-known/oauth-authorization-server`,
      { headers: PROXY_HEADERS }
    );
    expect(off.status).toBe(404);

    harness.flags.isEnabled.mockResolvedValue(true);
    const on = await fetch(
      `${harness.base}/.well-known/oauth-authorization-server`,
      { headers: PROXY_HEADERS }
    );
    expect(on.status).toBe(200);
  });

  it('should still parse JSON bodies on non-oauth routes', async () => {
    harness.flags.isEnabled.mockResolvedValue(true);

    const res = await fetch(`${harness.base}/api/v1/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    const body = (await res.json()) as { received: Record<string, unknown> };

    expect(res.status).toBe(201);
    expect(body.received).toEqual({ hello: 'world' });
  });
});

describe('OIDC mount (provider unavailable)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await buildHarness(null);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('should 404 oauth surfaces even when the flag is on', async () => {
    harness.flags.isEnabled.mockResolvedValue(true);

    const discovery = await fetch(
      `${harness.base}/.well-known/oauth-authorization-server`,
      { headers: PROXY_HEADERS }
    );
    const jwks = await fetch(`${harness.base}/oauth/jwks`, {
      headers: PROXY_HEADERS,
    });

    expect(discovery.status).toBe(404);
    expect(jwks.status).toBe(404);
  });
});
