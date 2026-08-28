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
  private readonly es256PublicKeys: readonly string[];
  private readonly resourceAudience: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    configService: ConfigService
  ) {
    this.jwtSecret = configService.getOrThrow('JWT_SECRET');
    this.es256PublicKeys = deriveOauthPublicKeys(
      configService.get('OAUTH_JWKS')
    );
    this.resourceAudience = configService.get('MCP_RESOURCE_URL');
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
      // Swallowed on purpose: this endpoint accepts two signing families, so
      // failing HS256 only rules the first one out.
    }

    const claims = await this.verifyEs256(token);
    if (claims === null) {
      return null;
    }

    // Audience is enforced AFTER signature verification: folding it into
    // verifyAsync would turn a wrong-aud token into a verify failure, which
    // falls through to JwtAuthGuard as a full session — an escalation.
    if (!this.hasResourceAudience(claims.aud)) {
      throw new ForbiddenException('MCP token audience mismatch');
    }
    return claims;
  }

  /**
   * Tries every configured OAuth key, because a JWKS carries several across a
   * rotation. Stopping at the first would leave a token signed by any of the
   * others unrecognised as MCP — and an unrecognised token skips the scope
   * check entirely while JwtAuthGuard, which holds all the keys, still admits
   * it.
   */
  private async verifyEs256(
    token: string
  ): Promise<(McpTokenClaims & { aud?: string | string[] }) | null> {
    for (const publicKey of this.es256PublicKeys) {
      try {
        return await this.jwtService.verifyAsync<
          McpTokenClaims & { aud?: string | string[] }
        >(token, { publicKey, algorithms: ['ES256'] });
      } catch {
        continue;
      }
    }
    return null;
  }

  private hasResourceAudience(aud: string | string[] | undefined): boolean {
    if (!this.resourceAudience) {
      return false;
    }
    return Array.isArray(aud)
      ? aud.includes(this.resourceAudience)
      : aud === this.resourceAudience;
  }
}
