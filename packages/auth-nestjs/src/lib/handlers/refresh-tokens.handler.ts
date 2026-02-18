import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import { SESSION_EXPIRY_MS } from '../../../../auth/src/lib/constants';
import { AuthErrors } from '../../../../auth/src/lib/errors/auth.errors';
import type { AuthDomainError } from '../../../../auth/src/lib/errors/auth.errors';
import {
  AuthEventName,
  TokenRefreshedEvent,
} from '../../../../auth/src/lib/events/auth.events';
import { hashToken } from '../../../../auth/src/lib/tokens/hash-token';
import { UserId } from '../../../../auth/src/lib/value-objects/user-id.vo';
import {
  SESSION_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from '../constants';
import type { SessionRepository } from '../ports/session.repository';
import type { AuthTokens, TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';

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
    // 1. Verify JWT signature
    const verifyResult =
      await this.tokenService.verifyRefreshToken(refreshToken);
    if (verifyResult.isErr()) {
      return err(verifyResult.error);
    }
    const payload = verifyResult.value;
    const userId = UserId.fromTrusted(payload.sub);

    // 2. Hash the incoming token and look up the session
    const tokenHash = hashToken(refreshToken);
    const session =
      await this.sessionRepository.findByRefreshTokenHash(tokenHash);

    if (!session) {
      // Token reuse detected: the token is valid (JWT signature OK) but
      // not in the database. This means someone is replaying an old token.
      // Invalidate ALL sessions for this user as a security measure.
      this.logger.warn(
        `Token reuse detected for user ${payload.sub}. Invalidating all sessions.`
      );
      await this.sessionRepository.deleteAllByUserId(payload.sub);
      return err(AuthErrors.tokenReuseDetected(payload.sub));
    }

    // 3. Check if session is expired
    if (session.expiresAt < new Date()) {
      await this.sessionRepository.deleteById(session.id);
      return err(AuthErrors.sessionExpired());
    }

    // 4. Verify user still exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      await this.sessionRepository.deleteById(session.id);
      return err(AuthErrors.userNotFound(payload.sub));
    }

    // 5. Delete the old session (token rotation)
    await this.sessionRepository.deleteById(session.id);

    // 6. Generate new token pair
    const tokensResult = await this.tokenService.generateTokens(
      userId,
      payload.email
    );
    if (tokensResult.isErr()) {
      return err(tokensResult.error);
    }

    const newTokens = tokensResult.value;

    // 7. Create new session with the new hashed refresh token
    const sessionResult = await this.sessionRepository.create({
      userId: payload.sub,
      refreshTokenHash: hashToken(newTokens.refreshToken),
      userAgent: session.userAgent ?? undefined,
      ipAddress: session.ipAddress ?? undefined,
      expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
    });
    if (sessionResult.isErr()) {
      return err(sessionResult.error);
    }

    this.eventEmitter.emit(
      AuthEventName.TOKEN_REFRESH,
      new TokenRefreshedEvent(payload.sub, new Date())
    );

    return ok(newTokens);
  }
}
