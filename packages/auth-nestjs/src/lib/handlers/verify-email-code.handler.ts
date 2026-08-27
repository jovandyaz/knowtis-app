import { timingSafeEqual } from 'node:crypto';

import {
  AuthErrors,
  AuthEventName,
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
  UserId,
  VERIFICATION_CODE_MAX_ATTEMPTS,
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

export interface VerifyEmailCodeInput {
  readonly userId: string;
  readonly code: string;
  readonly familyId?: string | undefined;
}

@Injectable()
export class VerifyEmailCodeHandler {
  private readonly logger = new Logger(VerifyEmailCodeHandler.name);

  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepository: EmailVerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository,
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: VerifyEmailCodeInput
  ): Promise<Result<void, AuthDomainError>> {
    const verification = await this.verificationTokenRepository.findByUserId(
      input.userId
    );
    if (!verification?.codeHash || !verification.codeExpiresAt) {
      return err(AuthErrors.invalidVerificationCode());
    }

    // Counting the attempt before comparing is what caps the guess budget:
    // comparing first would let concurrent callers spend attempts for free.
    const attempts = await this.verificationTokenRepository.incrementAttempts(
      verification.id
    );
    if (attempts === null) {
      return err(AuthErrors.invalidVerificationCode());
    }
    if (attempts > VERIFICATION_CODE_MAX_ATTEMPTS) {
      // The spent row must survive: it is what the resend cooldown keys off,
      // and it carries the emailed link the legitimate user still holds.
      return err(AuthErrors.tooManyVerificationAttempts());
    }

    if (verification.codeExpiresAt < new Date()) {
      return err(AuthErrors.invalidVerificationCode());
    }

    if (!this.codeMatches(verification.codeHash, input.code)) {
      return err(AuthErrors.invalidVerificationCode());
    }

    const userId = UserId.fromTrusted(input.userId);
    const user = await this.userRepository.findById(userId);
    if (user?.emailVerifiedAt) {
      await this.verificationTokenRepository.deleteAllByUserId(input.userId);
      return err(AuthErrors.emailAlreadyVerified());
    }

    const verifyResult = await this.userRepository.markEmailVerified(userId);
    if (verifyResult.isErr()) {
      this.logger.error(
        `Failed to mark email verified for user ${input.userId}`
      );
      return err(verifyResult.error);
    }

    await this.verificationTokenRepository.deleteAllByUserId(input.userId);
    await this.revokeOtherSessions(input.userId, input.familyId);

    this.eventEmitter.emit(
      AuthEventName.EMAIL_VERIFIED,
      new EmailVerifiedEvent(
        input.userId,
        EMAIL_VERIFICATION_SOURCE.CODE,
        new Date()
      )
    );

    return ok(undefined);
  }

  private codeMatches(codeHash: string, submittedCode: string): boolean {
    const expected = Buffer.from(codeHash, 'hex');
    const submitted = Buffer.from(this.tokenHasher.hash(submittedCode), 'hex');
    return (
      expected.length === submitted.length &&
      timingSafeEqual(expected, submitted)
    );
  }

  private async revokeOtherSessions(
    userId: string,
    familyId: string | undefined
  ): Promise<void> {
    if (familyId) {
      await this.sessionRepository.deleteAllByUserIdExceptFamily(
        userId,
        familyId
      );
      return;
    }
    await this.sessionRepository.deleteAllByUserId(userId);
  }
}
