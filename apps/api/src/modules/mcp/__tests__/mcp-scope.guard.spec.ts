import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import { MCP_SCOPE_KEY } from '../decorators/require-mcp-scope.decorator';
import { McpScopeGuard } from '../guards/mcp-scope.guard';

function createGuard(overrides: {
  scopeMetadata?: string;
  token?: string;
  payload?: Record<string, unknown>;
  verifyRejects?: boolean;
  contextType?: string;
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

describe('McpScopeGuard', () => {
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
      scopeMetadata: 'write',
      token: 'regular-jwt',
      payload: { sub: 'user-1', email: 'user@test.com' },
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('should throw ForbiddenException for MCP JWT on a route without scope metadata', async () => {
    const { guard, context } = createGuard({
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'read,write,share' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should pass for MCP JWT with sufficient scope', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'read',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'read,write' },
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('should throw ForbiddenException for MCP JWT without scopes claim', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'read',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException for MCP JWT with insufficient scope', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'write',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'read' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException for MCP JWT missing share scope', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'share',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'read,write' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should include required scope in error message', async () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'write',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'read' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      "'write'"
    );
  });

  it('should verify the token signature with the configured secret pinned to HS256', async () => {
    const { guard, context, verifyAsync } = createGuard({
      scopeMetadata: 'read',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'read' },
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
      payload: { sub: 'user-1', source: 'mcp', scopes: 'read' },
      contextType: 'ws',
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('should use reflector with correct metadata key', async () => {
    const { guard, reflector, context } = createGuard({
      scopeMetadata: 'read',
      token: 'mcp-jwt',
      payload: { sub: 'user-1', source: 'mcp', scopes: 'read' },
    });

    await guard.canActivate(context as never);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(MCP_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
