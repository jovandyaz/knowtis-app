import { randomBytes } from 'node:crypto';

import {
  AuthErrors,
  hashToken,
  UserId,
  VERIFICATION_TOKEN_EXPIRY_MS,
} from '@jovandyaz/auth';
import type { AuthDomainError } from '@jovandyaz/auth';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  EMAIL_SERVICE,
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '../constants';
import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository';
import type { EmailService } from '../ports/email.service';
import type { UserRepository } from '../ports/user.repository';

export interface ResendVerificationInput {
  readonly userId: string;
}

@Injectable()
export class ResendVerificationHandler {
  private readonly logger = new Logger(ResendVerificationHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepository: EmailVerificationTokenRepository
  ) {}

  async execute(
    input: ResendVerificationInput
  ): Promise<Result<void, AuthDomainError>> {
    const userId = UserId.fromTrusted(input.userId);

    const user = await this.userRepository.findById(userId);
    if (!user) {
      return err(AuthErrors.userNotFound(input.userId));
    }

    // Check if email is already verified
    if (user.emailVerifiedAt) {
      return err(AuthErrors.emailAlreadyVerified());
    }

    // Delete any existing verification tokens for this user
    await this.verificationTokenRepository.deleteAllByUserId(user.id);

    // Generate a random token and hash it for storage
    const plainToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(plainToken);

    const createResult = await this.verificationTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS),
    });
    if (createResult.isErr()) {
      this.logger.error('Failed to create email verification token');
      return err(createResult.error);
    }

    // Send verification email
    const emailResult = await this.emailService.sendEmailVerification(
      user.email,
      plainToken,
      user.name
    );
    if (emailResult.isErr()) {
      this.logger.error('Failed to send verification email');
      return err(AuthErrors.emailSendFailed());
    }

    return ok(undefined);
  }
}
