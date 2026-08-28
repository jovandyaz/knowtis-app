import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtVerifyOptions } from '@nestjs/jwt';

import { deriveOauthPublicKeys } from '../../config/oauth-public-keys';

const BEARER_PREFIX = 'Bearer ';

interface IdentityClaims {
  sub?: unknown;
  isAnonymous?: unknown;
}

export interface BearerIdentity {
  readonly userId: string;
  readonly isAnonymous: boolean;
}

function readBearerToken(request: Record<string, unknown>): string | null {
  const headers = request['headers'] as Record<string, unknown> | undefined;
  const authorization = headers?.['authorization'];
  if (
    typeof authorization !== 'string' ||
    !authorization.startsWith(BEARER_PREFIX)
  ) {
    return null;
  }
  const token = authorization.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolves the identity a request authenticates as. Returns null when it
 * carries no bearer token, or one this API cannot verify.
 *
 * The signature check is the point, not a formality: callers key rate-limit
 * buckets off this, and an unverified `sub` would let anyone mint unlimited
 * buckets by claiming a new identity per request.
 */
@Injectable()
export class BearerIdentityResolver {
  private readonly accessTokenSecret: string;
  private readonly oauthPublicKey: string | undefined;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService
  ) {
    this.accessTokenSecret = configService.getOrThrow('JWT_SECRET');
    this.oauthPublicKey = deriveOauthPublicKeys(
      configService.get('OAUTH_JWKS')
    )[0];
  }

  async resolve(
    request: Record<string, unknown>
  ): Promise<BearerIdentity | null> {
    const token = readBearerToken(request);
    if (token === null) {
      return null;
    }

    const claims = await this.verify(token);
    const userId = claims?.sub;
    if (typeof userId !== 'string' || userId.length === 0) {
      return null;
    }
    return { userId, isAnonymous: claims?.isAnonymous === true };
  }

  /** HS256 covers session and MCP-exchange tokens, ES256 the OAuth ones. */
  private async verify(token: string): Promise<IdentityClaims | null> {
    const sessionClaims = await this.verifyWith(token, {
      secret: this.accessTokenSecret,
      algorithms: ['HS256'],
    });
    if (sessionClaims !== null || this.oauthPublicKey === undefined) {
      return sessionClaims;
    }

    return this.verifyWith(token, {
      publicKey: this.oauthPublicKey,
      algorithms: ['ES256'],
    });
  }

  private async verifyWith(
    token: string,
    options: JwtVerifyOptions
  ): Promise<IdentityClaims | null> {
    try {
      return await this.jwtService.verifyAsync<IdentityClaims>(token, options);
    } catch {
      return null;
    }
  }
}
