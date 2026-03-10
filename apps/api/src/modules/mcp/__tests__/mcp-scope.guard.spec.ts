import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import { MCP_SCOPE_KEY } from '../decorators/require-mcp-scope.decorator';
import { McpScopeGuard } from '../guards/mcp-scope.guard';

function createGuard(overrides: {
  scopeMetadata?: string;
  token?: string;
  payload?: Record<string, unknown> | null;
}) {
  const reflector = {
    getAllAndOverride: vi
      .fn()
      .mockReturnValue(overrides.scopeMetadata ?? undefined),
  } as unknown as Reflector;

  const jwtService = {
    decode: vi.fn().mockReturnValue(overrides.payload ?? null),
  } as unknown as JwtService;

  const guard = new McpScopeGuard(reflector, jwtService);

  const context = {
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

  return { guard, reflector, jwtService, context };
}

describe('McpScopeGuard', () => {
  it('should pass when no scope metadata is set', () => {
    const { guard, context } = createGuard({});

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('should pass when no Authorization header is present', () => {
    const { guard, context } = createGuard({ scopeMetadata: 'read' });

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('should pass for regular user JWT (no source claim)', () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'read',
      token: 'regular-jwt',
      payload: { sub: 'user-1', email: 'user@test.com' },
    });

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('should pass for MCP JWT with sufficient scope', () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'read',
      token: 'mcp-jwt',
      payload: {
        sub: 'user-1',
        email: 'user@test.com',
        source: 'mcp',
        scopes: 'read,write',
      },
    });

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('should throw ForbiddenException for MCP JWT with insufficient scope', () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'write',
      token: 'mcp-jwt',
      payload: {
        sub: 'user-1',
        email: 'user@test.com',
        source: 'mcp',
        scopes: 'read',
      },
    });

    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException for MCP JWT missing share scope', () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'share',
      token: 'mcp-jwt',
      payload: {
        sub: 'user-1',
        email: 'user@test.com',
        source: 'mcp',
        scopes: 'read,write',
      },
    });

    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException
    );
  });

  it('should include required scope in error message', () => {
    const { guard, context } = createGuard({
      scopeMetadata: 'write',
      token: 'mcp-jwt',
      payload: {
        sub: 'user-1',
        email: 'user@test.com',
        source: 'mcp',
        scopes: 'read',
      },
    });

    expect(() => guard.canActivate(context as never)).toThrow("'write'");
  });

  it('should use reflector with correct metadata key', () => {
    const { guard, reflector, context } = createGuard({
      scopeMetadata: 'read',
    });

    guard.canActivate(context as never);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(MCP_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
