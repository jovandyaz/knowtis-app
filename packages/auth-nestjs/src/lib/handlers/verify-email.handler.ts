import {
  AuthErrors,
  AuthEventName,
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
  UserId,
} from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  SESSION_REPOSITORY,
  TOKEN_HASHER,
  USER_REPOSITORY,
} from '../constants';
import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository';
import type { SessionRepository } from '../ports/session.repository';
import type { UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';

export interface VerifyEmailInput {
  readonly token: string;
}

@Injectable()
export class VerifyEmailHandler {
  private readonly logger = new Logger(VerifyEmailHandler.name);

  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepository: EmailVerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: VerifyEmailInput
  ): Promise<Result<void, AuthDomainError>> {
    const tokenHash = this.tokenHasher.hash(input.token);

    const token =
      await this.verificationTokenRepository.findByTokenHash(tokenHash);
    if (!token) {
      return err(AuthErrors.invalidVerificationToken());
    }

    if (token.expiresAt < new Date()) {
      await this.verificationTokenRepository.deleteAllByUserId(token.userId);
      return err(AuthErrors.verificationTokenExpired());
    }

    const userIdResult = UserId.fromTrusted(token.userId);
    const user = await this.userRepository.findById(userIdResult);
    if (user?.emailVerifiedAt) {
      await this.verificationTokenRepository.deleteAllByUserId(token.userId);
      return err(AuthErrors.emailAlreadyVerified());
    }

    const verifyResult =
      await this.userRepository.markEmailVerified(userIdResult);
    if (verifyResult.isErr()) {
      this.logger.error(
        `Failed to mark email verified for user ${token.userId}`
      );
      return err(verifyResult.error);
    }

    await this.verificationTokenRepository.deleteAllByUserId(token.userId);
    await this.sessionRepository.deleteAllByUserId(token.userId);

    this.eventEmitter.emit(
      AuthEventName.EMAIL_VERIFIED,
      new EmailVerifiedEvent(
        token.userId,
        EMAIL_VERIFICATION_SOURCE.LINK,
        new Date()
      )
    );

    return ok(undefined);
  }
}
