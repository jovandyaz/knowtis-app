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

import { deriveOauthPublicKeys } from '../../../config/oauth-public-keys';
import { MCP_SCOPE_KEY } from '../decorators/require-mcp-scope.decorator';
import { TOKEN_SOURCE_MCP, type McpTokenClaims } from '../mcp-token';

@Injectable()
export class McpScopeGuard implements CanActivate {
  private readonly jwtSecret: string;
  private readonly es256PublicKey: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    configService: ConfigService
  ) {
    this.jwtSecret = configService.getOrThrow('JWT_SECRET');
    this.es256PublicKey = deriveOauthPublicKeys(
      configService.get('OAUTH_JWKS')
    )[0];
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

    const payload = await this.verifyMcpToken(token);

    if (!payload || payload.source !== TOKEN_SOURCE_MCP) {
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

  /**
   * Verifies MCP tokens on both signing paths: HS256 (session/API-key exchange)
   * and ES256 (OAuth access tokens from the authorization server). Returns null
   * for anything unverifiable (including raw API keys) — JwtAuthGuard makes the
   * final accept/reject decision on those.
   */
  private async verifyMcpToken(token: string): Promise<McpTokenClaims | null> {
    try {
      return await this.jwtService.verifyAsync<McpTokenClaims>(token, {
        secret: this.jwtSecret,
        algorithms: ['HS256'],
      });
    } catch {
      // Not an HS256 token — try the ES256 OAuth path below.
    }

    if (!this.es256PublicKey) {
      return null;
    }

    try {
      return await this.jwtService.verifyAsync<McpTokenClaims>(token, {
        publicKey: this.es256PublicKey,
        algorithms: ['ES256'],
      });
    } catch {
      return null;
    }
  }
}
