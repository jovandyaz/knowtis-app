import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type SecretOrKeyProvider } from 'passport-jwt';

import {
  JWT_AUDIENCE_ACCESS,
  JWT_ISSUER,
  JWT_VERIFICATION_KEY_SELECTOR,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
} from '../constants';
import type { JwtVerificationKeySelector } from '../jwt-verification-key-selector';
import type { SessionRepository } from '../ports/session.repository';
import type { JwtPayload } from '../ports/token.service';
import type { UserEntity, UserRepository } from '../ports/user.repository';

function providerFor(
  expected: 'HS256' | 'ES256',
  selectKey: JwtVerificationKeySelector
): SecretOrKeyProvider {
  return (_request, rawJwtToken, done) => {
    const selected = selectKey(rawJwtToken);
    if (expected === 'HS256' && selected?.algorithm === 'HS256') {
      done(null, selected.secret);
      return;
    }
    if (expected === 'ES256' && selected?.algorithm === 'ES256') {
      done(null, selected.publicKey);
      return;
    }
    done(new Error('Unsupported token signing key'));
  };
}

interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly emailVerifiedAt: Date | null;
  readonly locale: string | null;
  readonly familyId: string | undefined;
  readonly role: UserEntity['role'];
  readonly isAnonymous?: true;
}

async function validatePayload(
  payload: JwtPayload,
  userRepository: UserRepository,
  sessionRepository: SessionRepository
): Promise<AuthenticatedUser> {
  if (payload.source === undefined) {
    await assertLiveSessionToken(payload, sessionRepository);
  }

  try {
    const userId = UserId.fromTrusted(payload.sub);
    const user = await userRepository.findById(userId);
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
      ...(payload.isAnonymous && { isAnonymous: true as const }),
      familyId: payload.familyId,
      role: user.role,
    };
  } catch {
    throw new UnauthorizedException('Invalid token');
  }
}

async function assertLiveSessionToken(
  payload: JwtPayload,
  sessionRepository: SessionRepository
): Promise<void> {
  const { familyId } = payload;
  if (
    payload.iss !== JWT_ISSUER ||
    payload.aud !== JWT_AUDIENCE_ACCESS ||
    typeof familyId !== 'string'
  ) {
    throw new UnauthorizedException('Invalid token');
  }
  if (!(await sessionRepository.hasLiveSessionForFamily(familyId))) {
    throw new UnauthorizedException('Session revoked');
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt-hs256') {
  constructor(
    @Inject(JWT_VERIFICATION_KEY_SELECTOR)
    selectKey: JwtVerificationKeySelector,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: providerFor('HS256', selectKey),
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return validatePayload(
      payload,
      this.userRepository,
      this.sessionRepository
    );
  }
}

@Injectable()
export class OauthJwtStrategy extends PassportStrategy(Strategy, 'jwt-es256') {
  constructor(
    @Inject(JWT_VERIFICATION_KEY_SELECTOR)
    selectKey: JwtVerificationKeySelector,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: providerFor('ES256', selectKey),
      algorithms: ['ES256'],
    });
  }

  validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return validatePayload(
      payload,
      this.userRepository,
      this.sessionRepository
    );
  }
}
