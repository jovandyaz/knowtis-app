import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { MCP_SCOPE_KEY } from '../decorators/require-mcp-scope.decorator';
import { TOKEN_SOURCE_MCP, type McpTokenClaims } from '../mcp-token';

@Injectable()
export class McpScopeGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    configService: ConfigService
  ) {
    this.jwtSecret = configService.getOrThrow('JWT_SECRET');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return true;
    }

    let payload: McpTokenClaims;
    try {
      payload = await this.jwtService.verifyAsync<McpTokenClaims>(token, {
        secret: this.jwtSecret,
        algorithms: ['HS256'],
      });
    } catch {
      // Unverifiable tokens (including raw API keys) are rejected by JwtAuthGuard.
      return true;
    }

    if (payload.source !== TOKEN_SOURCE_MCP) {
      return true;
    }

    const requiredScope = this.reflector.getAllAndOverride<string | undefined>(
      MCP_SCOPE_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredScope) {
      throw new ForbiddenException('MCP tokens cannot access this endpoint');
    }

    const scopes = payload.scopes?.split(',') ?? [];

    if (!scopes.includes(requiredScope)) {
      throw new ForbiddenException(
        `MCP token missing required scope: '${requiredScope}'`
      );
    }

    return true;
  }
}
