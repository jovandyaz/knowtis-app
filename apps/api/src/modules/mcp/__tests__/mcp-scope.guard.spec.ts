import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { MCP_SCOPE_KEY } from '../decorators/require-mcp-scope.decorator';
import { McpScopeGuard } from '../guards/mcp-scope.guard';
import { MCP_SCOPES } from '../mcp-token';

function createGuard(overrides: {
  scopeMetadata?: string;
  token?: string;
  payload?: Record<string, unknown>;
  verifyRejects?: boolean;
  contextType?: string;
  oauthJwks?: string;
}) {
  const reflector = {
    getAllAndOverride: vi
      .fn()
      .mockReturnValue(overrides.scopeMetadata ?? undefined),
  } as unknown as Reflector;

  const verifyAsync = overrides.verifyRejects
    ? vi.fn().mockRejectedValue(new Error('invalid signature'))
    : vi.fn().mockResolvedValue(overrides.payload ?? {});

  const jwtService = { verifyAsync } as unknown as JwtService;

  const configService = {
    getOrThrow: vi.fn().mockReturnValue('test-secret'),
    get: vi
      .fn()
      .mockImplementation((key: string) =>
        key === 'OAUTH_JWKS' ? overrides.oauthJwks : undefined
      ),
  } as unknown as ConfigService;

  const guard = new McpScopeGuard(reflector, jwtService, configService);

  const context = {
    getType: vi.fn().mockReturnValue(overrides.contextType ?? 'http'),
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue({
        headers: {
          authorization: overrides.token
            ? `Bearer ${overrides.token}`
            : undefined,
        },
      }),
    }),
  };

  return { guard, reflector, jwtService, verifyAsync, context };
}

async function guardAllows(
  payload: Record<string, unknown>,
  requiredScope: string
): Promise<boolean> {
  const { guard, context } = createGuard({
    scopeMetadata: requiredScope,
    token: 'mcp-jwt',
    payload: { sub: 'user-1', source: 'mcp', ...payload },
  });

  try {
    return await guard.canActivate(context as never);
  } catch (error) {
    if (error instanceof ForbiddenException) {
      return false;
    }
    throw error;
  }
}

describe('McpScopeGuard', () => {
  it('should accept namespaced scopes and reject legacy names', async () => {
    await expect(
      guardAllows({ scopes: 'notes:read,notes:write' }, MCP_SCOPES.WRITE)
    ).resolves.toBe(true);
    await expect(
      guardAllows({ scopes: 'write' }, MCP_SCOPES.WRITE)
    ).resolves.toBe(false);
  });

  it('should pass when no Authorization header is present', async () => {
    const { guard, context, verifyAsync } = createGuard({});

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('should pass when token verification fails', async () => {
    const { guard, context } = createGuard({
      token: 'knk_raw-api-key-not-a-jwt',
      verifyRejects: true,
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('should pass for regular user JWT without scope metadata', async () => {
    const { guard, context } = createGuard({
      token: 'regular-jwt',
      payload: { sub: 'user-1', email: 'user@test.com' },
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('should pass for regular user JWT regardless of scope metadata', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'notes:write',
      token: 'regular-jwt',
      payload: { sub: 'user-1', email: 'user@test.com' },
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('should throw ForbiddenException for MCP JWT on a route without scope metadata', async () => {
    const { guard, context } = createGuard({
      token: 'mcp-jwt',
      payload: {
        sub: 'user-1',
        source: 'mcp',
        scopes: 'notes:read,notes:write,notes:share',
      },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should pass for MCP JWT with sufficient scope', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'notes:read',
      token: 'mcp-jwt',
      payload: {
        sub: 'user-1',
        source: 'mcp',
        scopes: 'notes:read,notes:write',
      },
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('should throw ForbiddenException for MCP JWT without scopes claim', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'notes:read',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException for MCP JWT with insufficient scope', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'notes:write',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'notes:read' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException for MCP JWT missing share scope', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'notes:share',
      token: 'mcp-jwt',
      payload: {
        sub: 'user-1',
        source: 'mcp',
        scopes: 'notes:read,notes:write',
      },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should include required scope in error message', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'notes:write',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'notes:read' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      "'notes:write'"
    );
  });

  it('should verify the token signature with the configured secret pinned to HS256', async () => {
    const { guard, context, verifyAsync } = createGuard({
      scopeMetadata: 'notes:read',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'notes:read' },
    });

    await guard.canActivate(context as never);

    expect(verifyAsync).toHaveBeenCalledWith('mcp-jwt', {
      secret: 'test-secret',
      algorithms: ['HS256'],
    });
  });

  it('should pass for non-HTTP execution contexts', async () => {
    const { guard, context, verifyAsync } = createGuard({
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'notes:read' },
      contextType: 'ws',
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('should use reflector with correct metadata key', async () => {
    const { guard, reflector, context } = createGuard({
      scopeMetadata: 'notes:read',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'notes:read' },
    });

    await guard.canActivate(context as never);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(MCP_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});

describe('McpScopeGuard with ES256 OAuth tokens', () => {
  let jwks: string;
  let signOauthToken: (scopes: string) => Promise<string>;

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('ES256', {
      extractable: true,
    });
    const jwk = await exportJWK(privateKey);
    jwk.alg = 'ES256';
    jwk.use = 'sig';
    jwk.kid = 'test-key';
    jwks = JSON.stringify({ keys: [jwk] });
    signOauthToken = (scopes: string) =>
      new SignJWT({ source: 'mcp', scopes })
        .setProtectedHeader({ alg: 'ES256' })
        .setSubject('user-1')
        .setExpirationTime('15m')
        .sign(privateKey);
  });

  function createRealGuard(scopeMetadata: string) {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(scopeMetadata),
    } as unknown as Reflector;
    const configService = {
      getOrThrow: vi.fn().mockReturnValue('unused-hs-secret'),
      get: vi
        .fn()
        .mockImplementation((key: string) =>
          key === 'OAUTH_JWKS' ? jwks : undefined
        ),
    } as unknown as ConfigService;
    return new McpScopeGuard(reflector, new JwtService(), configService);
  }

  function contextWithToken(token: string) {
    return {
      getType: vi.fn().mockReturnValue('http'),
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          headers: { authorization: `Bearer ${token}` },
        }),
      }),
    };
  }

  it('should enforce scope on ES256 OAuth tokens with sufficient scope', async () => {
    const guard = createRealGuard(MCP_SCOPES.WRITE);
    const token = await signOauthToken('notes:read,notes:write');

    await expect(
      guard.canActivate(contextWithToken(token) as never)
    ).resolves.toBe(true);
  });

  it('should reject ES256 OAuth tokens with insufficient scope', async () => {
    const guard = createRealGuard(MCP_SCOPES.WRITE);
    const token = await signOauthToken('notes:read');

    await expect(
      guard.canActivate(contextWithToken(token) as never)
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject ES256 OAuth tokens on routes without scope metadata', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const configService = {
      getOrThrow: vi.fn().mockReturnValue('unused-hs-secret'),
      get: vi
        .fn()
        .mockImplementation((key: string) =>
          key === 'OAUTH_JWKS' ? jwks : undefined
        ),
    } as unknown as ConfigService;
    const guard = new McpScopeGuard(reflector, new JwtService(), configService);
    const token = await signOauthToken('notes:read');

    await expect(
      guard.canActivate(contextWithToken(token) as never)
    ).rejects.toThrow(ForbiddenException);
  });
});
