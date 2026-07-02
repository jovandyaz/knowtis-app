import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import {
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
  type ExecutionContext,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureFlagsService } from '../../feature-flags';
import { OauthInteractionController } from '../oauth-interaction.controller';
import { OAUTH_PROVIDER, OAUTH_RUNTIME } from '../oauth.module';
import type { OidcProviderHandle } from '../oidc-provider.factory';

const RESOURCE_URL = 'https://mcp.knowtis.app/mcp';
const TEST_USER = {
  id: 'user-1',
  email: 'user@knowtis.app',
  name: 'User One',
  role: 'user',
};

interface MockInteraction {
  params: Record<string, unknown>;
  prompt: { name: string };
  session?: { accountId: string };
  grantId?: string;
  lastSubmission?: Record<string, unknown>;
  returnTo: string;
  result?: Record<string, unknown>;
  persist: ReturnType<typeof vi.fn>;
}

class MockGrant {
  addResourceScope = vi.fn();
  addOIDCScope = vi.fn();
  save = vi.fn().mockResolvedValue('grant-123');
  constructor(public props: { accountId?: string; clientId?: string }) {
    grantInstances.push(this);
  }
}

let grantInstances: MockGrant[] = [];

interface MockProvider {
  Interaction: { find: ReturnType<typeof vi.fn> };
  Grant: typeof MockGrant & { find: ReturnType<typeof vi.fn> };
  Client: { find: ReturnType<typeof vi.fn> };
  AccessToken: { revokeByGrantId: ReturnType<typeof vi.fn> };
  RefreshToken: { revokeByGrantId: ReturnType<typeof vi.fn> };
  AuthorizationCode: { revokeByGrantId: ReturnType<typeof vi.fn> };
}

function makeProvider(): MockProvider {
  const grantClass = MockGrant as MockProvider['Grant'];
  grantClass.find = vi.fn().mockResolvedValue(undefined);
  return {
    Interaction: { find: vi.fn() },
    Grant: grantClass,
    Client: { find: vi.fn().mockResolvedValue(undefined) },
    AccessToken: { revokeByGrantId: vi.fn().mockResolvedValue(undefined) },
    RefreshToken: { revokeByGrantId: vi.fn().mockResolvedValue(undefined) },
    AuthorizationCode: {
      revokeByGrantId: vi.fn().mockResolvedValue(undefined),
    },
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

async function buildHarness(
  provider: MockProvider | null,
  runtime: { resourceUrl: string } | null = { resourceUrl: RESOURCE_URL }
): Promise<Harness> {
  const handle: OidcProviderHandle | null = provider
    ? ({ provider, callback: vi.fn() } as unknown as OidcProviderHandle)
    : null;
  const flags = { isEnabled: vi.fn().mockResolvedValue(true) };

  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [OauthInteractionController],
    providers: [
      { provide: OAUTH_PROVIDER, useValue: handle },
      { provide: OAUTH_RUNTIME, useValue: runtime },
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  return {
    app,
    base: await app.getUrl(),
    provider: provider as MockProvider,
    flags,
  };
}

function makeInteraction(
  overrides: Partial<MockInteraction> = {}
): MockInteraction {
  return {
    params: {
      client_id: 'https://client.example/cimd.json',
      redirect_uri: 'https://client.example/callback',
      scope: 'notes:read notes:write',
    },
    prompt: { name: 'consent' },
    returnTo: 'https://api.knowtis.app/oauth/auth/UID',
    persist: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('OauthInteractionController', () => {
  let harness: Harness;

  beforeEach(() => {
    grantInstances = [];
  });

  afterEach(async () => {
    await harness.app.close();
  });

  it('should describe the interaction including redirect host and CIMD flag', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(makeInteraction());
    harness.provider.Client.find.mockResolvedValue({
      clientName: 'Example MCP Client',
    });

    const res = await fetch(`${harness.base}/api/v1/oauth/interactions/UID`);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      clientId: 'https://client.example/cimd.json',
      clientName: 'Example MCP Client',
      redirectHost: 'client.example',
      scopes: ['notes:read', 'notes:write'],
      isCimdClient: true,
    });
  });

  it('should 404 describe when the interaction is unknown', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(undefined);

    const res = await fetch(`${harness.base}/api/v1/oauth/interactions/GONE`);

    expect(res.status).toBe(404);
  });

  it('should 404 describe when the mcp_oauth flag is off', async () => {
    harness = await buildHarness(makeProvider());
    harness.flags.isEnabled.mockResolvedValue(false);

    const res = await fetch(`${harness.base}/api/v1/oauth/interactions/UID`);

    expect(res.status).toBe(404);
    expect(harness.provider.Interaction.find).not.toHaveBeenCalled();
  });

  it('should 404 describe when the provider handle is null', async () => {
    harness = await buildHarness(null, null);

    const res = await fetch(`${harness.base}/api/v1/oauth/interactions/UID`);

    expect(res.status).toBe(404);
  });

  it('should reject confirm from anonymous users', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(makeInteraction());

    const res = await fetch(
      `${harness.base}/api/v1/oauth/interactions/UID/confirm`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approvedScopes: ['notes:read'] }),
      }
    );

    expect(res.status).toBe(401);
  });

  it('should build a grant with approved notes scopes and finish the interaction', async () => {
    harness = await buildHarness(makeProvider());
    const interaction = makeInteraction({
      session: { accountId: TEST_USER.id },
    });
    harness.provider.Interaction.find.mockResolvedValue(interaction);

    const res = await fetch(
      `${harness.base}/api/v1/oauth/interactions/UID/confirm`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer knowtis-jwt',
        },
        body: JSON.stringify({
          approvedScopes: ['notes:read', 'notes:write'],
        }),
      }
    );
    const body = (await res.json()) as { returnTo: string };

    expect(res.status).toBe(201);
    expect(body.returnTo).toBe('https://api.knowtis.app/oauth/auth/UID');
    expect(grantInstances).toHaveLength(1);
    expect(grantInstances[0].props).toEqual({
      accountId: TEST_USER.id,
      clientId: 'https://client.example/cimd.json',
    });
    expect(grantInstances[0].addResourceScope).toHaveBeenCalledWith(
      RESOURCE_URL,
      'notes:read notes:write'
    );
    expect(grantInstances[0].save).toHaveBeenCalled();
    expect(interaction.result).toEqual({ consent: { grantId: 'grant-123' } });
    expect(interaction.persist).toHaveBeenCalled();
  });

  it('should submit login and consent when there is no oidc session account', async () => {
    harness = await buildHarness(makeProvider());
    const interaction = makeInteraction();
    harness.provider.Interaction.find.mockResolvedValue(interaction);

    await fetch(`${harness.base}/api/v1/oauth/interactions/UID/confirm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer knowtis-jwt',
      },
      body: JSON.stringify({ approvedScopes: ['notes:read'] }),
    });

    expect(interaction.result).toEqual({
      login: { accountId: TEST_USER.id },
      consent: { grantId: 'grant-123' },
    });
    expect(grantInstances[0].addResourceScope).toHaveBeenCalledWith(
      RESOURCE_URL,
      'notes:read'
    );
  });

  it('should grant offline_access only when requested and approved', async () => {
    harness = await buildHarness(makeProvider());
    const interaction = makeInteraction({
      params: {
        client_id: 'local-client',
        redirect_uri: 'https://client.example/callback',
        scope: 'notes:read offline_access',
      },
      session: { accountId: TEST_USER.id },
    });
    harness.provider.Interaction.find.mockResolvedValue(interaction);

    await fetch(`${harness.base}/api/v1/oauth/interactions/UID/confirm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer knowtis-jwt',
      },
      body: JSON.stringify({
        approvedScopes: ['notes:read', 'offline_access'],
      }),
    });

    expect(grantInstances[0].addOIDCScope).toHaveBeenCalledWith(
      'offline_access'
    );
  });

  it('should revoke a prior grant before saving the new one on re-consent', async () => {
    harness = await buildHarness(makeProvider());
    const interaction = makeInteraction({
      grantId: 'old-grant',
      session: { accountId: TEST_USER.id },
    });
    harness.provider.Interaction.find.mockResolvedValue(interaction);
    const priorGrant = { destroy: vi.fn().mockResolvedValue(undefined) };
    harness.provider.Grant.find.mockResolvedValue(priorGrant);

    await fetch(`${harness.base}/api/v1/oauth/interactions/UID/confirm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer knowtis-jwt',
      },
      body: JSON.stringify({ approvedScopes: ['notes:read'] }),
    });

    expect(harness.provider.AccessToken.revokeByGrantId).toHaveBeenCalledWith(
      'old-grant'
    );
    expect(harness.provider.RefreshToken.revokeByGrantId).toHaveBeenCalledWith(
      'old-grant'
    );
    expect(priorGrant.destroy).toHaveBeenCalled();
  });

  it('should reject confirm bodies with unknown scopes', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(makeInteraction());

    const res = await fetch(
      `${harness.base}/api/v1/oauth/interactions/UID/confirm`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer knowtis-jwt',
        },
        body: JSON.stringify({ approvedScopes: ['notes:read', 'admin:all'] }),
      }
    );

    expect(res.status).toBe(400);
  });

  it('should deny with access_denied on abort', async () => {
    harness = await buildHarness(makeProvider());
    const interaction = makeInteraction();
    harness.provider.Interaction.find.mockResolvedValue(interaction);

    const res = await fetch(
      `${harness.base}/api/v1/oauth/interactions/UID/abort`,
      { method: 'POST' }
    );
    const body = (await res.json()) as { returnTo: string };

    expect(res.status).toBe(201);
    expect(body.returnTo).toBe('https://api.knowtis.app/oauth/auth/UID');
    expect(interaction.result).toEqual({
      error: 'access_denied',
      error_description: 'End-user aborted the authorization request',
    });
    expect(interaction.persist).toHaveBeenCalled();
  });
});
