import {
  AuthErrors,
  UserId,
  VERIFICATION_CODE_EXPIRY_MS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  VERIFICATION_TOKEN_EXPIRY_MS,
} from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  EMAIL_SERVICE,
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  TOKEN_HASHER,
  USER_REPOSITORY,
} from '../constants';
import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository';
import type { EmailService } from '../ports/email.service';
import type { UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { generateSecureToken } from './shared/generate-secure-token';
import { generateVerificationCode } from './shared/generate-verification-code';

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
    private readonly verificationTokenRepository: EmailVerificationTokenRepository,
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher
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
    if (
      existing &&
      Date.now() - existing.createdAt.getTime() <
        VERIFICATION_RESEND_COOLDOWN_MS
    ) {
      return err(AuthErrors.resendCooldown());
    }

    await this.verificationTokenRepository.deleteAllByUserId(user.id);

    const { plainToken, tokenHash } = generateSecureToken(this.tokenHasher);
    const { plainCode, codeHash } = generateVerificationCode(this.tokenHasher);

    const createResult = await this.verificationTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS),
      codeHash,
      codeExpiresAt: new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS),
    });
    if (createResult.isErr()) {
      this.logger.error('Failed to create email verification token');
      return err(createResult.error);
    }

    const emailResult = await this.emailService.sendEmailVerification(
      user.email,
      { token: plainToken, code: plainCode },
      user.name,
      user.locale ?? undefined
    );
    if (emailResult.isErr()) {
      this.logger.error('Failed to send verification email');
      return err(AuthErrors.emailSendFailed());
    }

    return ok(undefined);
  }
}
