import {
  AuthErrors,
  AuthEventName,
  hashToken,
  REFRESH_TOKEN_GRACE_MS,
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
import type {
  SessionEntity,
  SessionRepository,
} from '../ports/session.repository';
import type { JwtPayload, TokenService } from '../ports/token.service';
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
      return this.handleMissingSession(payload);
    }

    if (session.expiresAt < new Date()) {
      await this.sessionRepository.deleteById(session.id);
      return err(AuthErrors.sessionExpired());
    }

    if (session.rotatedAt) {
      return this.handleRotatedSession(payload, session, session.rotatedAt);
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      await this.sessionRepository.deleteById(session.id);
      return err(AuthErrors.userNotFound(payload.sub));
    }

    await this.sessionRepository.markRotated(session.id);
    return this.issueRotatedTokens(payload, session);
  }

  private async handleMissingSession(
    payload: JwtPayload
  ): Promise<Result<AuthTokens, AuthDomainError>> {
    // Revoke only the token's family, never every session the user owns. A
    // legacy token (pre-rotation deploy) carries no family, so just reject it.
    if (!payload.familyId) {
      return err(AuthErrors.invalidRefreshToken());
    }
    this.logger.warn(
      `Refresh token reuse (no session) for user ${payload.sub}. Invalidating family ${payload.familyId}.`
    );
    await this.sessionRepository.deleteByFamilyId(payload.familyId);
    return err(AuthErrors.tokenReuseDetected(payload.sub));
  }

  private async handleRotatedSession(
    payload: JwtPayload,
    session: SessionEntity,
    rotatedAt: Date
  ): Promise<Result<AuthTokens, AuthDomainError>> {
    const withinGrace =
      Date.now() - rotatedAt.getTime() <= REFRESH_TOKEN_GRACE_MS;

    if (withinGrace) {
      return this.issueRotatedTokens(payload, session);
    }

    this.logger.warn(
      `Refresh token reuse for user ${payload.sub}. Invalidating family ${session.familyId}.`
    );
    await this.sessionRepository.deleteByFamilyId(session.familyId);
    return err(AuthErrors.tokenReuseDetected(payload.sub));
  }

  private async issueRotatedTokens(
    payload: JwtPayload,
    session: SessionEntity
  ): Promise<Result<AuthTokens, AuthDomainError>> {
    const tokensResult = await createSessionWithTokens(
      {
        tokenService: this.tokenService,
        sessionRepository: this.sessionRepository,
      },
      {
        userId: payload.sub,
        email: payload.email,
        familyId: session.familyId,
        userAgent: session.userAgent ?? undefined,
        ipAddress: session.ipAddress ?? undefined,
        ...(payload.isAnonymous && { isAnonymous: true }),
      }
    );
    if (tokensResult.isErr()) {
      return err(tokensResult.error);
    }

    await this.sessionRepository.deleteRotatedBefore(
      new Date(Date.now() - REFRESH_TOKEN_GRACE_MS)
    );

    this.eventEmitter.emit(
      AuthEventName.TOKEN_REFRESH,
      new TokenRefreshedEvent(payload.sub, new Date())
    );

    return ok(tokensResult.value);
  }
}
