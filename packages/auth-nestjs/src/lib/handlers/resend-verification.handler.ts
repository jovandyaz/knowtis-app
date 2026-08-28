import {
  AuthErrors,
  msUntilResendAllowed,
  UserId,
} from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '../constants';
import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository';
import type { UserRepository } from '../ports/user.repository';
import { VerificationEmailIssuer } from '../services/verification-email-issuer.service';

export interface ResendVerificationInput {
  readonly userId: string;
}

@Injectable()
export class ResendVerificationHandler {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepository: EmailVerificationTokenRepository,
    private readonly verificationEmailIssuer: VerificationEmailIssuer
  ) {}

  async execute(
    input: ResendVerificationInput
  ): Promise<Result<void, AuthDomainError>> {
    const userId = UserId.fromTrusted(input.userId);

    const user = await this.userRepository.findById(userId);
    if (!user) {
      return err(AuthErrors.userNotFound(input.userId));
    }

    if (user.emailVerifiedAt) {
      return err(AuthErrors.emailAlreadyVerified());
    }

    // Every resend mints a row with a fresh attempt budget, so without this
    // cooldown an attacker could reset the guess cap at will.
    const existing = await this.verificationTokenRepository.findByUserId(
      user.id
    );
    if (existing) {
      const retryAfterMs = msUntilResendAllowed(existing.createdAt);
      if (retryAfterMs > 0) {
        return err(AuthErrors.resendCooldown(retryAfterMs));
      }
    }

    await this.verificationTokenRepository.deleteAllByUserId(user.id);

    return this.verificationEmailIssuer.issue(user);
  }
}
