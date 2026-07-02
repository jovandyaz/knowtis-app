import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import {
  UnauthorizedException,
  VersioningType,
  type ExecutionContext,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DATABASE_CONNECTION } from '../../../database';
import { FeatureFlagsService } from '../../feature-flags';
import {
  grantBelongsToAccount,
  listGrantsByAccount,
} from '../drizzle-oidc.adapter';
import { OauthGrantsController } from '../oauth-grants.controller';
import { OAUTH_PROVIDER } from '../oauth.tokens';
import type { OidcProviderHandle } from '../oidc-provider.factory';

vi.mock('../drizzle-oidc.adapter', () => ({
  listGrantsByAccount: vi.fn(),
  grantBelongsToAccount: vi.fn(),
}));

const TEST_USER = {
  id: 'user-1',
  email: 'user@knowtis.app',
  name: 'User One',
  role: 'user',
};

const RESOURCE_URL = 'https://mcp.knowtis.app/mcp';
const GRANT_IAT = 1_700_000_000;

interface MockProvider {
  Client: { find: ReturnType<typeof vi.fn> };
  AccessToken: { revokeByGrantId: ReturnType<typeof vi.fn> };
  RefreshToken: { revokeByGrantId: ReturnType<typeof vi.fn> };
  AuthorizationCode: { revokeByGrantId: ReturnType<typeof vi.fn> };
  Grant: { adapter: { destroy: ReturnType<typeof vi.fn> } };
}

function makeProvider(): MockProvider {
  return {
    Client: { find: vi.fn().mockResolvedValue(undefined) },
    AccessToken: { revokeByGrantId: vi.fn().mockResolvedValue(undefined) },
    RefreshToken: { revokeByGrantId: vi.fn().mockResolvedValue(undefined) },
    AuthorizationCode: { revokeByGrantId: vi.fn().mockResolvedValue(undefined) },
    Grant: { adapter: { destroy: vi.fn().mockResolvedValue(undefined) } },
  };
}

function grantRow(overrides: {
  id: string;
  clientId: string;
  resources?: Record<string, string>;
  openidScope?: string;
  rejectedResources?: Record<string, string>;
  iat?: number;
}) {
  return {
    model: 'Grant',
    id: overrides.id,
    payload: {
      iat: overrides.iat ?? GRANT_IAT,
      exp: (overrides.iat ?? GRANT_IAT) + 2_592_000,
      jti: overrides.id,
      kind: 'Grant',
      accountId: TEST_USER.id,
      clientId: overrides.clientId,
      ...(overrides.resources ? { resources: overrides.resources } : {}),
      ...(overrides.openidScope
        ? { openid: { scope: overrides.openidScope } }
        : {}),
      ...(overrides.rejectedResources
        ? { rejected: { resources: overrides.rejectedResources } }
        : {}),
    },
    grantId: null,
    userCode: null,
    uid: null,
    expiresAt: null,
    consumedAt: null,
  };
}

const fakeJwtGuard = {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.headers.authorization) {
      throw new UnauthorizedException();
    }
    req.user = TEST_USER;
    return true;
  },
};

interface Harness {
  app: NestExpressApplication;
  base: string;
  provider: MockProvider;
  flags: { isEnabled: ReturnType<typeof vi.fn> };
}

async function buildHarness(provider: MockProvider | null): Promise<Harness> {
  const handle: OidcProviderHandle | null = provider
    ? ({ provider, callback: vi.fn() } as unknown as OidcProviderHandle)
    : null;
  const flags = { isEnabled: vi.fn().mockResolvedValue(true) };

  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [OauthGrantsController],
    providers: [
      { provide: OAUTH_PROVIDER, useValue: handle },
      { provide: DATABASE_CONNECTION, useValue: {} },
      { provide: FeatureFlagsService, useValue: flags },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(fakeJwtGuard)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });
  await app.listen(0, '127.0.0.1');
  return {
    app,
    base: await app.getUrl(),
    provider: provider as MockProvider,
    flags,
  };
}

function authed(base: string, path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { authorization: 'Bearer knowtis-jwt', ...(init.headers ?? {}) },
  });
}

describe('OauthGrantsController', () => {
  let harness: Harness;

  afterEach(async () => {
    vi.mocked(listGrantsByAccount).mockReset();
    vi.mocked(grantBelongsToAccount).mockReset();
    await harness.app.close();
  });

  describe('GET /oauth/grants', () => {
    it('should return only the caller-owned grants with mapped scopes and createdAt', async () => {
      harness = await buildHarness(makeProvider());
      harness.provider.Client.find.mockResolvedValue({
        clientName: 'Example MCP Client',
      });
      vi.mocked(listGrantsByAccount).mockResolvedValue([
        grantRow({
          id: 'grant-1',
          clientId: 'client-dcr-1',
          resources: { [RESOURCE_URL]: 'notes:read notes:write' },
          openidScope: 'offline_access',
        }),
      ] as never);

      const res = await authed(harness.base, '/api/v1/oauth/grants');
      const body = (await res.json()) as { grants: unknown[] };

      expect(res.status).toBe(200);
      expect(vi.mocked(listGrantsByAccount).mock.calls[0][1]).toBe(TEST_USER.id);
      expect(body.grants).toEqual([
        {
          grantId: 'grant-1',
          clientId: 'client-dcr-1',
          clientName: 'Example MCP Client',
          scopes: ['notes:read', 'notes:write', 'offline_access'],
          createdAt: new Date(GRANT_IAT * 1000).toISOString(),
        },
      ]);
    });

    it('should derive the client name from the host for CIMD (URL) client ids without a client lookup', async () => {
      harness = await buildHarness(makeProvider());
      vi.mocked(listGrantsByAccount).mockResolvedValue([
        grantRow({
          id: 'grant-cimd',
          clientId: 'https://claude.ai/cimd.json',
          resources: { [RESOURCE_URL]: 'notes:read' },
        }),
      ] as never);

      const res = await authed(harness.base, '/api/v1/oauth/grants');
      const body = (await res.json()) as {
        grants: { clientName: string | null }[];
      };

      expect(res.status).toBe(200);
      expect(body.grants[0].clientName).toBe('claude.ai');
      expect(harness.provider.Client.find).not.toHaveBeenCalled();
    });

    it('should exclude rejected scopes from the displayed grant scopes', async () => {
      harness = await buildHarness(makeProvider());
      vi.mocked(listGrantsByAccount).mockResolvedValue([
        grantRow({
          id: 'grant-mixed',
          clientId: 'client-dcr-2',
          resources: { [RESOURCE_URL]: 'notes:read' },
          rejectedResources: { [RESOURCE_URL]: 'notes:write' },
        }),
      ] as never);

      const res = await authed(harness.base, '/api/v1/oauth/grants');
      const body = (await res.json()) as { grants: { scopes: string[] }[] };

      expect(body.grants[0].scopes).toEqual(['notes:read']);
    });

    it('should 404 when the mcp_oauth flag is off without touching the store', async () => {
      harness = await buildHarness(makeProvider());
      harness.flags.isEnabled.mockResolvedValue(false);

      const res = await authed(harness.base, '/api/v1/oauth/grants');

      expect(res.status).toBe(404);
      expect(listGrantsByAccount).not.toHaveBeenCalled();
    });

    it('should 404 when the provider handle is null', async () => {
      harness = await buildHarness(null);

      const res = await authed(harness.base, '/api/v1/oauth/grants');

      expect(res.status).toBe(404);
    });

    it('should reject anonymous callers with 401', async () => {
      harness = await buildHarness(makeProvider());

      const res = await fetch(`${harness.base}/api/v1/oauth/grants`);

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /oauth/grants/:grantId', () => {
    it('should revoke the full token family and return 204 for an owned grant', async () => {
      harness = await buildHarness(makeProvider());
      vi.mocked(grantBelongsToAccount).mockResolvedValue(true);

      const res = await authed(harness.base, '/api/v1/oauth/grants/grant-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(vi.mocked(grantBelongsToAccount).mock.calls[0].slice(1)).toEqual([
        'grant-1',
        TEST_USER.id,
      ]);
      expect(harness.provider.AccessToken.revokeByGrantId).toHaveBeenCalledWith(
        'grant-1'
      );
      expect(harness.provider.RefreshToken.revokeByGrantId).toHaveBeenCalledWith(
        'grant-1'
      );
      expect(
        harness.provider.AuthorizationCode.revokeByGrantId
      ).toHaveBeenCalledWith('grant-1');
      expect(harness.provider.Grant.adapter.destroy).toHaveBeenCalledWith(
        'grant-1'
      );
    });

    it('should 404 a grant that does not belong to the caller without revoking', async () => {
      harness = await buildHarness(makeProvider());
      vi.mocked(grantBelongsToAccount).mockResolvedValue(false);

      const res = await authed(harness.base, '/api/v1/oauth/grants/foreign', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      expect(
        harness.provider.AccessToken.revokeByGrantId
      ).not.toHaveBeenCalled();
      expect(harness.provider.Grant.adapter.destroy).not.toHaveBeenCalled();
    });

    it('should 404 when the mcp_oauth flag is off', async () => {
      harness = await buildHarness(makeProvider());
      harness.flags.isEnabled.mockResolvedValue(false);

      const res = await authed(harness.base, '/api/v1/oauth/grants/grant-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      expect(grantBelongsToAccount).not.toHaveBeenCalled();
    });

    it('should reject anonymous callers with 401', async () => {
      harness = await buildHarness(makeProvider());

      const res = await fetch(`${harness.base}/api/v1/oauth/grants/grant-1`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });
});
