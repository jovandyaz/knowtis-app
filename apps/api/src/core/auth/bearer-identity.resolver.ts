import {
  JWT_VERIFICATION_KEY_SELECTOR,
  type JwtVerificationKeySelector,
} from '@jovandyaz/auth-nestjs';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

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
  constructor(
    private readonly jwtService: JwtService,
    @Inject(JWT_VERIFICATION_KEY_SELECTOR)
    private readonly selectVerificationKey: JwtVerificationKeySelector
  ) {}

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

  private async verify(token: string): Promise<IdentityClaims | null> {
    const selected = this.selectVerificationKey(token);
    if (!selected) {
      return null;
    }
    try {
      return selected.algorithm === 'HS256'
        ? await this.jwtService.verifyAsync<IdentityClaims>(token, {
            secret: selected.secret,
            algorithms: ['HS256'],
          })
        : await this.jwtService.verifyAsync<IdentityClaims>(token, {
            publicKey: selected.publicKey,
            algorithms: ['ES256'],
          });
    } catch {
      return null;
    }
  }
}
