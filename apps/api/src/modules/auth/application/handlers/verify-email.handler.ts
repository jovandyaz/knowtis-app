import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  AuthErrors,
  type AuthDomainError,
} from '../../domain/errors/auth.errors';
import { hashToken } from '../../domain/hash-token';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type EmailVerificationTokenRepository,
} from '../../domain/ports/email-verification-token.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/user.repository';
import { UserId } from '../../domain/value-objects/user-id.vo';

export interface VerifyEmailInput {
  readonly token: string;
}

@Injectable()
export class VerifyEmailHandler {
  private readonly logger = new Logger(VerifyEmailHandler.name);

  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepository: EmailVerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository
  ) {}

  async execute(
    input: VerifyEmailInput
  ): Promise<Result<void, AuthDomainError>> {
    const tokenHash = hashToken(input.token);

    const token =
      await this.verificationTokenRepository.findByTokenHash(tokenHash);
    if (!token) {
      return err(AuthErrors.invalidVerificationToken());
    }

    // Check if token has expired
    if (token.expiresAt < new Date()) {
      await this.verificationTokenRepository.deleteAllByUserId(token.userId);
      return err(AuthErrors.verificationTokenExpired());
    }

    // Check if already verified
    const userIdResult = UserId.fromTrusted(token.userId);
    const user = await this.userRepository.findById(userIdResult);
    if (user?.emailVerifiedAt) {
      await this.verificationTokenRepository.deleteAllByUserId(token.userId);
      return err(AuthErrors.emailAlreadyVerified());
    }

    // Mark user's email as verified
    const verifyResult =
      await this.userRepository.markEmailVerified(userIdResult);
    if (verifyResult.isErr()) {
      this.logger.error(
        `Failed to mark email verified for user ${token.userId}`
      );
      return err(verifyResult.error);
    }

    // Delete all verification tokens for this user
    await this.verificationTokenRepository.deleteAllByUserId(token.userId);

    return ok(undefined);
  }
}
