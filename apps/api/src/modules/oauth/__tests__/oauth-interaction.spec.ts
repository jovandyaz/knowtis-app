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

import { DATABASE_CONNECTION } from '../../../database';
import { FeatureFlagsService } from '../../feature-flags';
import { OauthInteractionController } from '../oauth-interaction.controller';
import { OAUTH_PROVIDER, OAUTH_RUNTIME } from '../oauth.tokens';
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
  rejectResourceScope = vi.fn();
  addOIDCScope = vi.fn();
  rejectOIDCScope = vi.fn();
  save = vi.fn().mockResolvedValue('grant-123');
  constructor(public props: { accountId?: string; clientId?: string }) {
    grantInstances.push(this);
  }
}

let grantInstances: MockGrant[] = [];

interface MockProvider {
  Interaction: { find: ReturnType<typeof vi.fn> };
  Grant: typeof MockGrant & { adapter: { destroy: ReturnType<typeof vi.fn> } };
  Client: { find: ReturnType<typeof vi.fn> };
  AccessToken: { revokeByGrantId: ReturnType<typeof vi.fn> };
  RefreshToken: { revokeByGrantId: ReturnType<typeof vi.fn> };
  AuthorizationCode: { revokeByGrantId: ReturnType<typeof vi.fn> };
}

function makeProvider(): MockProvider {
  const grantClass = MockGrant as MockProvider['Grant'];
  grantClass.adapter = { destroy: vi.fn().mockResolvedValue(undefined) };
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
  dbWhere: ReturnType<typeof vi.fn>;
}

async function buildHarness(
  provider: MockProvider | null,
  runtime: { resourceUrl: string } | null = { resourceUrl: RESOURCE_URL }
): Promise<Harness> {
  const handle: OidcProviderHandle | null = provider
    ? ({ provider, callback: vi.fn() } as unknown as OidcProviderHandle)
    : null;
  const flags = { isEnabled: vi.fn().mockResolvedValue(true) };
  const dbWhere = vi.fn().mockResolvedValue([]);
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: dbWhere }),
    }),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [OauthInteractionController],
    providers: [
      { provide: OAUTH_PROVIDER, useValue: handle },
      { provide: OAUTH_RUNTIME, useValue: runtime },
      { provide: DATABASE_CONNECTION, useValue: db },
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
    dbWhere,
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

function postConfirm(
  base: string,
  approvedScopes: string[]
): Promise<Response> {
  return fetch(`${base}/api/v1/oauth/interactions/UID/confirm`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer knowtis-jwt',
    },
    body: JSON.stringify({ approvedScopes }),
  });
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

  it('should return an empty redirect host for a malformed redirect_uri', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(
      makeInteraction({
        params: {
          client_id: 'local-client',
          redirect_uri: 'not-a-valid-url',
          scope: 'notes:read',
        },
      })
    );

    const res = await fetch(`${harness.base}/api/v1/oauth/interactions/UID`);
    const body = (await res.json()) as { redirectHost: string };

    expect(res.status).toBe(200);
    expect(body.redirectHost).toBe('');
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

    const res = await postConfirm(harness.base, ['notes:read', 'notes:write']);
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
    expect(grantInstances[0].rejectResourceScope).not.toHaveBeenCalled();
    expect(grantInstances[0].save).toHaveBeenCalled();
    expect(interaction.result).toEqual({
      login: { accountId: TEST_USER.id },
      consent: { grantId: 'grant-123' },
    });
    expect(interaction.persist).toHaveBeenCalled();
  });

  it('should submit login unconditionally even when an oidc session matches', async () => {
    harness = await buildHarness(makeProvider());
    const interaction = makeInteraction();
    harness.provider.Interaction.find.mockResolvedValue(interaction);

    await postConfirm(harness.base, ['notes:read']);

    expect(interaction.result).toEqual({
      login: { accountId: TEST_USER.id },
      consent: { grantId: 'grant-123' },
    });
    expect(grantInstances[0].addResourceScope).toHaveBeenCalledWith(
      RESOURCE_URL,
      'notes:read'
    );
  });

  it('should grant only the intersection of approved and requested scopes', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(
      makeInteraction({
        params: {
          client_id: 'local-client',
          redirect_uri: 'https://client.example/callback',
          scope: 'notes:read',
        },
        session: { accountId: TEST_USER.id },
      })
    );

    await postConfirm(harness.base, ['notes:read', 'notes:write']);

    expect(grantInstances[0].addResourceScope).toHaveBeenCalledWith(
      RESOURCE_URL,
      'notes:read'
    );
    expect(grantInstances[0].rejectResourceScope).not.toHaveBeenCalled();
  });

  it('should reject requested notes scopes the user denied', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(
      makeInteraction({ session: { accountId: TEST_USER.id } })
    );

    await postConfirm(harness.base, ['notes:read']);

    expect(grantInstances[0].addResourceScope).toHaveBeenCalledWith(
      RESOURCE_URL,
      'notes:read'
    );
    expect(grantInstances[0].rejectResourceScope).toHaveBeenCalledWith(
      RESOURCE_URL,
      'notes:write'
    );
  });

  it('should grant offline_access when requested and approved', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(
      makeInteraction({
        params: {
          client_id: 'local-client',
          redirect_uri: 'https://client.example/callback',
          scope: 'notes:read offline_access',
        },
        session: { accountId: TEST_USER.id },
      })
    );

    await postConfirm(harness.base, ['notes:read', 'offline_access']);

    expect(grantInstances[0].addOIDCScope).toHaveBeenCalledWith(
      'offline_access'
    );
    expect(grantInstances[0].rejectOIDCScope).not.toHaveBeenCalled();
  });

  it('should ignore offline_access approved but not requested', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(
      makeInteraction({
        params: {
          client_id: 'local-client',
          redirect_uri: 'https://client.example/callback',
          scope: 'notes:read',
        },
        session: { accountId: TEST_USER.id },
      })
    );

    await postConfirm(harness.base, ['notes:read', 'offline_access']);

    expect(grantInstances[0].addOIDCScope).not.toHaveBeenCalled();
    expect(grantInstances[0].rejectOIDCScope).not.toHaveBeenCalled();
  });

  it('should reject offline_access requested but denied', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(
      makeInteraction({
        params: {
          client_id: 'local-client',
          redirect_uri: 'https://client.example/callback',
          scope: 'notes:read offline_access',
        },
        session: { accountId: TEST_USER.id },
      })
    );

    await postConfirm(harness.base, ['notes:read']);

    expect(grantInstances[0].addOIDCScope).not.toHaveBeenCalled();
    expect(grantInstances[0].rejectOIDCScope).toHaveBeenCalledWith(
      'offline_access'
    );
  });

  it('should revoke prior grants found by account and client before saving', async () => {
    harness = await buildHarness(makeProvider());
    const interaction = makeInteraction();
    harness.provider.Interaction.find.mockResolvedValue(interaction);
    harness.dbWhere.mockResolvedValue([{ id: 'stored-grant' }]);

    await postConfirm(harness.base, ['notes:read']);

    for (const model of [
      harness.provider.AccessToken,
      harness.provider.RefreshToken,
      harness.provider.AuthorizationCode,
    ]) {
      expect(model.revokeByGrantId).toHaveBeenCalledWith('stored-grant');
    }
    expect(harness.provider.Grant.adapter.destroy).toHaveBeenCalledWith(
      'stored-grant'
    );
  });

  it('should also revoke the session-derived grant id without duplicating', async () => {
    harness = await buildHarness(makeProvider());
    const interaction = makeInteraction({
      grantId: 'session-grant',
      session: { accountId: TEST_USER.id },
    });
    harness.provider.Interaction.find.mockResolvedValue(interaction);
    harness.dbWhere.mockResolvedValue([
      { id: 'stored-grant' },
      { id: 'session-grant' },
    ]);

    await postConfirm(harness.base, ['notes:read']);

    expect(harness.provider.Grant.adapter.destroy).toHaveBeenCalledTimes(2);
    expect(harness.provider.Grant.adapter.destroy).toHaveBeenCalledWith(
      'stored-grant'
    );
    expect(harness.provider.Grant.adapter.destroy).toHaveBeenCalledWith(
      'session-grant'
    );
  });

  it('should reject confirm bodies with unknown scopes', async () => {
    harness = await buildHarness(makeProvider());
    harness.provider.Interaction.find.mockResolvedValue(makeInteraction());

    const res = await postConfirm(harness.base, ['notes:read', 'admin:all']);

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
