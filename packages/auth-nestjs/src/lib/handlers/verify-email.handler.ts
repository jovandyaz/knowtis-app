import { AuthErrors, EMAIL_VERIFICATION_SOURCE } from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, type Result } from 'neverthrow';

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
import { completeEmailVerification } from './shared/complete-email-verification';

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

    return completeEmailVerification(
      {
        userRepository: this.userRepository,
        verificationTokenRepository: this.verificationTokenRepository,
        sessionRepository: this.sessionRepository,
        eventEmitter: this.eventEmitter,
        logger: this.logger,
      },
      { userId: token.userId, source: EMAIL_VERIFICATION_SOURCE.LINK }
    );
  }
}
