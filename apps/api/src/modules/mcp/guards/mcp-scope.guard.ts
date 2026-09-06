import {
  JWT_VERIFICATION_KEY_SELECTOR,
  type JwtVerificationKeySelector,
} from '@jovandyaz/auth-nestjs';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
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
  private readonly resourceAudience: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(JWT_VERIFICATION_KEY_SELECTOR)
    private readonly selectVerificationKey: JwtVerificationKeySelector,
    configService: ConfigService
  ) {
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
    const selected = this.selectVerificationKey(token);
    if (!selected) {
      return null;
    }

    let claims: McpTokenClaims & { aud?: string | string[] };
    try {
      claims =
        selected.algorithm === 'HS256'
          ? await this.jwtService.verifyAsync(token, {
              secret: selected.secret,
              algorithms: ['HS256'],
            })
          : await this.jwtService.verifyAsync(token, {
              publicKey: selected.publicKey,
              algorithms: ['ES256'],
            });
    } catch {
      return null;
    }

    // Audience is enforced AFTER signature verification: folding it into
    // verifyAsync would turn a wrong-aud token into a verify failure, which
    // falls through to JwtAuthGuard as a full session — an escalation.
    if (
      selected.algorithm === 'ES256' &&
      !this.hasResourceAudience(claims.aud)
    ) {
      throw new ForbiddenException('MCP token audience mismatch');
    }
    return claims;
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
