import { randomUUID } from 'crypto';

import {
  createSessionWithTokens,
  SESSION_REPOSITORY,
  TOKEN_HASHER,
  TOKEN_SERVICE,
  TokenHasher,
} from '@jovandyaz/auth-nestjs';
import type { SessionRepository, TokenService } from '@jovandyaz/auth-nestjs';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../../../users/users.service';

export interface AnonymousSession {
  user: {
    id: string;
    name: string;
    isAnonymous: boolean;
  };
  accessToken: string;
  refreshToken: string;
}

interface AnonymousUser {
  id: string;
  email: string;
}

interface AnonymousTokenPayload {
  sub: string;
  isAnonymous?: boolean;
  iat?: number;
  exp?: number;
}

const MIN_EXCHANGEABLE_TOKEN_LIFETIME_SECONDS = 60 * 60;

@Injectable()
export class AnonymousAuthService {
  private readonly logger = new Logger(AnonymousAuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository,
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher
  ) {}

  /**
   * Creates an anonymous session backed by the standard refresh-token flow.
   * When a still-valid anonymous JWT is provided, the same anonymous identity
   * is reused instead of minting a new user.
   */
  async createAnonymousSession(
    existingToken?: string
  ): Promise<AnonymousSession> {
    const existingUser = existingToken
      ? await this.resolveExistingAnonymousUser(existingToken)
      : null;
    const user = existingUser ?? (await this.createAnonymousUser());

    const tokensResult = await createSessionWithTokens(
      {
        tokenService: this.tokenService,
        sessionRepository: this.sessionRepository,
        tokenHasher: this.tokenHasher,
      },
      { userId: user.id, email: user.email, isAnonymous: true }
    );

    if (tokensResult.isErr()) {
      this.logger.error(
        `Failed to create anonymous session for user ${user.id}: ${tokensResult.error.message}`
      );
      throw new InternalServerErrorException(
        'Failed to create anonymous session'
      );
    }

    return {
      user: {
        id: user.id,
        name: 'Anonymous',
        isAnonymous: true,
      },
      accessToken: tokensResult.value.accessToken,
      refreshToken: tokensResult.value.refreshToken,
    };
  }

  /**
   * Verifies an anonymous token as an identity proof for login/register data
   * migration: expiration is ignored (the proof is bound to an authenticated
   * login), but signature, claims, and the anonymous DB user must all match.
   */
  async verifyMigrationProof(
    token: string,
    anonymousUserId: string
  ): Promise<boolean> {
    let payload: AnonymousTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AnonymousTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow('JWT_SECRET'),
          algorithms: ['HS256'],
          ignoreExpiration: true,
        }
      );
    } catch {
      return false;
    }

    if (!payload.isAnonymous || payload.sub !== anonymousUserId) {
      return false;
    }

    const user = await this.usersService.findById(payload.sub);
    return user?.isAnonymous === true;
  }

  private async resolveExistingAnonymousUser(
    token: string
  ): Promise<AnonymousUser | null> {
    let payload: AnonymousTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AnonymousTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow('JWT_SECRET'),
          algorithms: ['HS256'],
        }
      );
    } catch {
      return null;
    }

    if (!payload.isAnonymous || !payload.sub) {
      return null;
    }

    if (
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp - payload.iat <= MIN_EXCHANGEABLE_TOKEN_LIFETIME_SECONDS
    ) {
      return null;
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user?.isAnonymous) {
      return null;
    }
    return { id: user.id, email: user.email };
  }

  private async createAnonymousUser(): Promise<AnonymousUser> {
    const anonymousEmail = `anon-${randomUUID()}@anonymous.knowtis.local`;

    const user = await this.usersService.create({
      email: anonymousEmail,
      name: 'Anonymous',
      passwordHash: '!anonymous-no-login',
      provider: 'anonymous',
      isAnonymous: true,
    });

    return { id: user.id, email: user.email };
  }
}
