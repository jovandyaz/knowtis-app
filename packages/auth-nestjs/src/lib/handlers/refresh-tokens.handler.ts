import {
  AuthErrors,
  AuthEventName,
  hashToken,
  TokenRefreshedEvent,
  UserId,
} from '@jovandyaz/auth/server';
import type { AuthDomainError, AuthTokens } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  SESSION_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from '../constants';
import type { SessionRepository } from '../ports/session.repository';
import type { TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';
import { createSessionWithTokens } from './shared/create-session';

@Injectable()
export class RefreshTokensHandler {
  private readonly logger = new Logger(RefreshTokensHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    refreshToken: string
  ): Promise<Result<AuthTokens, AuthDomainError>> {
    const verifyResult =
      await this.tokenService.verifyRefreshToken(refreshToken);
    if (verifyResult.isErr()) {
      return err(verifyResult.error);
    }
    const payload = verifyResult.value;
    const userId = UserId.fromTrusted(payload.sub);

    const tokenHash = hashToken(refreshToken);
    const session =
      await this.sessionRepository.findByRefreshTokenHash(tokenHash);

    if (!session) {
      this.logger.warn(
        `Token reuse detected for user ${payload.sub}. Invalidating all sessions.`
      );
      await this.sessionRepository.deleteAllByUserId(payload.sub);
      return err(AuthErrors.tokenReuseDetected(payload.sub));
    }

    if (session.expiresAt < new Date()) {
      await this.sessionRepository.deleteById(session.id);
      return err(AuthErrors.sessionExpired());
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      await this.sessionRepository.deleteById(session.id);
      return err(AuthErrors.userNotFound(payload.sub));
    }

    await this.sessionRepository.deleteById(session.id);

    const tokensResult = await createSessionWithTokens(
      {
        tokenService: this.tokenService,
        sessionRepository: this.sessionRepository,
      },
      {
        userId: payload.sub,
        email: payload.email,
        userAgent: session.userAgent ?? undefined,
        ipAddress: session.ipAddress ?? undefined,
      }
    );
    if (tokensResult.isErr()) {
      return err(tokensResult.error);
    }

    const newTokens = tokensResult.value;

    this.eventEmitter.emit(
      AuthEventName.TOKEN_REFRESH,
      new TokenRefreshedEvent(payload.sub, new Date())
    );

    return ok(newTokens);
  }
}
