import { createJwtVerificationKeySelector } from '@jovandyaz/auth-nestjs';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { exportJWK, exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { deriveOauthPublicKeys } from '../../../config/oauth-public-keys';
import { MCP_SCOPE_KEY } from '../decorators/require-mcp-scope.decorator';
import { McpScopeGuard } from '../guards/mcp-scope.guard';
import { MCP_SCOPES } from '../mcp-token';

const HS256_TOKEN = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString(
  'base64url'
)}.payload.signature`;

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
    get: vi.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;

  const guard = new McpScopeGuard(
    reflector,
    jwtService,
    createJwtVerificationKeySelector(
      'test-secret',
      deriveOauthPublicKeys(overrides.oauthJwks)
    ),
    configService
  );

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
    token: HS256_TOKEN,
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
      token: HS256_TOKEN,
      verifyRejects: true,
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('should pass for regular user JWT without scope metadata', async () => {
    const { guard, context } = createGuard({
      token: HS256_TOKEN,
      payload: { sub: 'user-1', email: 'user@test.com' },
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('should pass for regular user JWT regardless of scope metadata', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'notes:write',
      token: HS256_TOKEN,
      payload: { sub: 'user-1', email: 'user@test.com' },
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('should throw ForbiddenException for MCP JWT on a route without scope metadata', async () => {
    const { guard, context } = createGuard({
      token: HS256_TOKEN,
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
      token: HS256_TOKEN,
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
      token: HS256_TOKEN,
      payload: { sub: 'user-1', source: 'mcp' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException for MCP JWT with insufficient scope', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'notes:write',
      token: HS256_TOKEN,
      payload: { sub: 'user-1', source: 'mcp', scopes: 'notes:read' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException for MCP JWT missing share scope', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'notes:share',
      token: HS256_TOKEN,
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
      token: HS256_TOKEN,
      payload: { sub: 'user-1', source: 'mcp', scopes: 'notes:read' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      "'notes:write'"
    );
  });

  it('should verify the token signature with the configured secret pinned to HS256', async () => {
    const { guard, context, verifyAsync } = createGuard({
      scopeMetadata: 'notes:read',
      token: HS256_TOKEN,
      payload: { sub: 'user-1', source: 'mcp', scopes: 'notes:read' },
    });

    await guard.canActivate(context as never);

    expect(verifyAsync).toHaveBeenCalledWith(HS256_TOKEN, {
      secret: 'test-secret',
      algorithms: ['HS256'],
    });
  });

  it('should pass for non-HTTP execution contexts', async () => {
    const { guard, context, verifyAsync } = createGuard({
      token: HS256_TOKEN,
      payload: { sub: 'user-1', source: 'mcp', scopes: 'notes:read' },
      contextType: 'ws',
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('should use reflector with correct metadata key', async () => {
    const { guard, reflector, context } = createGuard({
      scopeMetadata: 'notes:read',
      token: HS256_TOKEN,
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
  const RESOURCE_URL = 'https://mcp.knowtis.app/mcp';
  let jwks: string;
  let signOauthToken: (
    scopes: string,
    aud?: string | string[]
  ) => Promise<string>;

  beforeAll(async () => {
    const { privateKey } = await generateKeyPair('ES256', {
      extractable: true,
    });
    const jwk = await exportJWK(privateKey);
    jwk.alg = 'ES256';
    jwk.use = 'sig';
    jwk.kid = 'test-key';
    jwks = JSON.stringify({ keys: [jwk] });
    signOauthToken = (scopes: string, aud: string | string[] = RESOURCE_URL) =>
      new SignJWT({ source: 'mcp', scopes, aud })
        .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
        .setSubject('user-1')
        .setExpirationTime('15m')
        .sign(privateKey);
  });

  function createRealGuard(scopeMetadata: string | undefined) {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(scopeMetadata),
    } as unknown as Reflector;
    const configService = {
      get: vi
        .fn()
        .mockImplementation((key: string) =>
          key === 'MCP_RESOURCE_URL' ? RESOURCE_URL : undefined
        ),
    } as unknown as ConfigService;
    // Same module options as McpModule's JwtModule.register — the guard's ES256
    // verify relies on per-call options taking precedence over these.
    const jwtService = new JwtService({
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    });
    return new McpScopeGuard(
      reflector,
      jwtService,
      createJwtVerificationKeySelector(
        'unused-hs-secret',
        deriveOauthPublicKeys(jwks)
      ),
      configService
    );
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
    const guard = createRealGuard(undefined);
    const token = await signOauthToken('notes:read');

    await expect(
      guard.canActivate(contextWithToken(token) as never)
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject a valid-signature ES256 token with a foreign audience instead of passing it through', async () => {
    const guard = createRealGuard(MCP_SCOPES.READ);
    const token = await signOauthToken(
      'notes:read',
      'https://other-service.example'
    );

    await expect(
      guard.canActivate(contextWithToken(token) as never)
    ).rejects.toThrow('audience mismatch');
  });

  it('should reject an ES256 token without an aud claim', async () => {
    const guard = createRealGuard(MCP_SCOPES.READ);
    const token = await new SignJWT({ source: 'mcp', scopes: 'notes:read' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject('user-1')
      .setExpirationTime('15m')
      .sign(
        (await import('node:crypto')).createPrivateKey({
          key: JSON.parse(jwks).keys[0],
          format: 'jwk',
        })
      );

    await expect(
      guard.canActivate(contextWithToken(token) as never)
    ).rejects.toThrow('audience mismatch');
  });

  it('should accept an aud array that contains the resource url', async () => {
    const guard = createRealGuard(MCP_SCOPES.READ);
    const token = await signOauthToken('notes:read', [
      RESOURCE_URL,
      'https://sibling.example',
    ]);

    await expect(
      guard.canActivate(contextWithToken(token) as never)
    ).resolves.toBe(true);
  });

  it('does not recognize a token without kid when only one key is configured', async () => {
    const token = await new SignJWT({
      source: 'mcp',
      scopes: 'notes:read',
      aud: RESOURCE_URL,
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('user-1')
      .setExpirationTime('15m')
      .sign(
        (await import('node:crypto')).createPrivateKey({
          key: JSON.parse(jwks).keys[0],
          format: 'jwk',
        })
      );

    await expect(
      createRealGuard(undefined).canActivate(contextWithToken(token) as never)
    ).resolves.toBe(true);
  });
});

describe('McpScopeGuard across a JWKS rotation', () => {
  const RESOURCE_URL = 'https://mcp.knowtis.app/mcp';
  let rotatedJwks: string;
  let currentPublicPem: string;
  let signWithInvalidSignature: () => Promise<string>;
  let signWithRotatedKey: (
    scopes: string,
    aud?: string | string[],
    kid?: string | null
  ) => Promise<string>;

  beforeAll(async () => {
    const retiring = await generateKeyPair('ES256', { extractable: true });
    const current = await generateKeyPair('ES256', { extractable: true });
    currentPublicPem = await exportSPKI(current.publicKey);

    async function toJwk(key: CryptoKey, kid: string) {
      const jwk = await exportJWK(key);
      jwk.alg = 'ES256';
      jwk.use = 'sig';
      jwk.kid = kid;
      return jwk;
    }

    // The retiring key stays first, so a guard that reads only keys[0] cannot
    // verify anything signed with the key now in use.
    rotatedJwks = JSON.stringify({
      keys: [
        await toJwk(retiring.privateKey, 'retiring-key'),
        await toJwk(current.privateKey, 'current-key'),
      ],
    });

    signWithRotatedKey = (scopes, aud = RESOURCE_URL, kid = 'current-key') =>
      new SignJWT({ source: 'mcp', scopes, aud })
        .setProtectedHeader(
          kid === null ? { alg: 'ES256' } : { alg: 'ES256', kid }
        )
        .setSubject('user-1')
        .setExpirationTime('15m')
        .sign(current.privateKey);

    signWithInvalidSignature = () =>
      new SignJWT({ source: 'mcp', scopes: 'notes:read', aud: RESOURCE_URL })
        .setProtectedHeader({ alg: 'ES256', kid: 'current-key' })
        .setSubject('user-1')
        .setExpirationTime('15m')
        .sign(retiring.privateKey);
  });

  function createGuardOverRotatedJwks(scopeMetadata: string | undefined) {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(scopeMetadata),
    } as unknown as Reflector;
    const configService = {
      get: vi
        .fn()
        .mockImplementation((key: string) =>
          key === 'MCP_RESOURCE_URL' ? RESOURCE_URL : undefined
        ),
    } as unknown as ConfigService;
    return new McpScopeGuard(
      reflector,
      new JwtService({
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
      createJwtVerificationKeySelector(
        'unused-hs-secret',
        deriveOauthPublicKeys(rotatedJwks)
      ),
      configService
    );
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

  it('enforces scope on a token signed by a later key, instead of waving it through unrecognised', async () => {
    const guard = createGuardOverRotatedJwks(MCP_SCOPES.WRITE);
    const token = await signWithRotatedKey('notes:read');

    await expect(
      guard.canActivate(contextWithToken(token) as never)
    ).rejects.toThrow(ForbiddenException);
  });

  it('still admits a token signed by a later key when its scope suffices', async () => {
    const guard = createGuardOverRotatedJwks(MCP_SCOPES.READ);
    const token = await signWithRotatedKey('notes:read');

    await expect(
      guard.canActivate(contextWithToken(token) as never)
    ).resolves.toBe(true);
  });

  it('returns 403 for a later-key token with the wrong audience', async () => {
    const token = await signWithRotatedKey(
      'notes:read',
      'https://wrong-resource.example/mcp'
    );

    await expect(
      createGuardOverRotatedJwks(MCP_SCOPES.READ).canActivate(
        contextWithToken(token) as never
      )
    ).rejects.toThrow('MCP token audience mismatch');
  });

  it('does not recognize a configured signature carrying an unknown kid', async () => {
    const token = await signWithRotatedKey(
      'notes:read',
      RESOURCE_URL,
      'unknown'
    );

    await expect(
      createGuardOverRotatedJwks(undefined).canActivate(
        contextWithToken(token) as never
      )
    ).resolves.toBe(true);
  });

  it('does not recognize a token without kid', async () => {
    const token = await signWithRotatedKey('notes:read', RESOURCE_URL, null);

    await expect(
      createGuardOverRotatedJwks(undefined).canActivate(
        contextWithToken(token) as never
      )
    ).resolves.toBe(true);
  });

  it('does not recognize a token with an invalid signature', async () => {
    const token = await signWithInvalidSignature();

    await expect(
      createGuardOverRotatedJwks(undefined).canActivate(
        contextWithToken(token) as never
      )
    ).resolves.toBe(true);
  });

  it.each([
    ['malformed header', 'not-json.payload.signature'],
    [
      'alg none',
      `${Buffer.from(JSON.stringify({ alg: 'none' })).toString(
        'base64url'
      )}.${Buffer.from(JSON.stringify({ source: 'mcp' })).toString(
        'base64url'
      )}.`,
    ],
  ])('does not recognize %s', async (_name, token) => {
    await expect(
      createGuardOverRotatedJwks(undefined).canActivate(
        contextWithToken(token) as never
      )
    ).resolves.toBe(true);
  });

  it('does not accept an OAuth public key as an HS256 secret', async () => {
    const token = await new SignJWT({ source: 'mcp', scopes: 'notes:read' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(currentPublicPem));

    await expect(
      createGuardOverRotatedJwks(undefined).canActivate(
        contextWithToken(token) as never
      )
    ).resolves.toBe(true);
  });

  it('verifies a token selected by a later kid exactly once', async () => {
    const verifyAsync = vi.spyOn(JwtService.prototype, 'verifyAsync');
    const token = await signWithRotatedKey('notes:read');

    try {
      await expect(
        createGuardOverRotatedJwks(MCP_SCOPES.READ).canActivate(
          contextWithToken(token) as never
        )
      ).resolves.toBe(true);
      expect(verifyAsync).toHaveBeenCalledTimes(1);
      expect(verifyAsync).toHaveBeenCalledWith(token, {
        publicKey: expect.any(String),
        algorithms: ['ES256'],
      });
    } finally {
      verifyAsync.mockRestore();
    }
  });
});
