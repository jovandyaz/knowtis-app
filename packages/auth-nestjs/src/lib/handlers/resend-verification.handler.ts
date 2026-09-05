import {
  AuthErrors,
  UserId,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import { USER_REPOSITORY } from '../constants';
import type { UserRepository } from '../ports/user.repository';
import { VerificationEmailIssuer } from '../services/verification-email-issuer.service';

export interface ResendVerificationInput {
  readonly userId: string;
}

@Injectable()
export class ResendVerificationHandler {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
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

    // Every resend restarts the attempt budget, so without this cooldown an
    // attacker could reset the guess cap at will.
    return this.verificationEmailIssuer.issue(user, {
      cooldownMs: VERIFICATION_RESEND_COOLDOWN_MS,
    });
  }
}
