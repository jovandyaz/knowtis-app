import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type SecretOrKeyProvider } from 'passport-jwt';

import type { AuthModuleOptions } from '../auth.module';
import {
  AUTH_MODULE_OPTIONS,
  JWT_AUDIENCE_ACCESS,
  JWT_ISSUER,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
} from '../constants';
import type { SessionRepository } from '../ports/session.repository';
import type { JwtPayload } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';

function readAlg(rawJwtToken: string): string | null {
  const encodedHeader = rawJwtToken.split('.')[0];
  if (!encodedHeader) {
    return null;
  }
  try {
    const header: unknown = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8')
    );
    if (
      header &&
      typeof header === 'object' &&
      typeof (header as { alg?: unknown }).alg === 'string'
    ) {
      return (header as { alg: string }).alg;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Dispatches signature verification by the JWT header `alg`: HS256 session
 * tokens verify against the shared access-token secret, ES256 MCP OAuth tokens
 * verify against the authorization server's public key. Any other algorithm is
 * rejected. Only the first ES256 key is used — kid selection is deferred until
 * key rotation lands.
 */
function createSecretOrKeyProvider(
  options: AuthModuleOptions
): SecretOrKeyProvider {
  const { accessTokenSecret, additionalPublicKeys } = options.tokenConfig;
  const es256PublicKey = additionalPublicKeys?.[0]?.publicKey;

  return (_request, rawJwtToken, done) => {
    const alg = readAlg(rawJwtToken);

    if (alg === 'HS256') {
      done(null, accessTokenSecret);
      return;
    }

    if (alg === 'ES256' && es256PublicKey) {
      done(null, es256PublicKey);
      return;
    }

    done(new Error('Unsupported token signing algorithm'));
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(AUTH_MODULE_OPTIONS) options: AuthModuleOptions,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: createSecretOrKeyProvider(options),
      algorithms: ['HS256', 'ES256'],
    });
  }

  async validate(payload: JwtPayload) {
    // Tokens with a `source` claim (MCP exchange / OAuth) carry no session;
    // the app-level scope guard is responsible for gating them.
    if (payload.source === undefined) {
      await this.assertLiveSessionToken(payload);
    }

    try {
      const userId = UserId.fromTrusted(payload.sub);
      const user = await this.userRepository.findById(userId);

      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        emailVerifiedAt: user.emailVerifiedAt,
        locale: user.locale,
        ...(payload.isAnonymous && { isAnonymous: true }),
        familyId: payload.familyId,
        role: user.role,
      };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private async assertLiveSessionToken(payload: JwtPayload): Promise<void> {
    const { familyId } = payload;
    const hasExpectedClaims =
      payload.iss === JWT_ISSUER &&
      payload.aud === JWT_AUDIENCE_ACCESS &&
      typeof familyId === 'string';

    if (!hasExpectedClaims || typeof familyId !== 'string') {
      throw new UnauthorizedException('Invalid token');
    }

    const live = await this.sessionRepository.hasLiveSessionForFamily(familyId);
    if (!live) {
      throw new UnauthorizedException('Session revoked');
    }
  }
}
