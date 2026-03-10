import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { MCP_SCOPE_KEY } from '../decorators/require-mcp-scope.decorator';

interface McpJwtPayload {
  source?: string;
  scopes?: string;
}

@Injectable()
export class McpScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScope = this.reflector.getAllAndOverride<string>(
      MCP_SCOPE_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredScope) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return true;
    }

    const payload = this.jwtService.decode<McpJwtPayload>(token);

    if (!payload || payload.source !== 'mcp') {
      return true;
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
