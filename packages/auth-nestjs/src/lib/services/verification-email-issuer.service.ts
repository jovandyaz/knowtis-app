import {
  AuthErrors,
  VERIFICATION_CODE_EXPIRY_MS,
  VERIFICATION_TOKEN_EXPIRY_MS,
} from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  EMAIL_SERVICE,
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  TOKEN_HASHER,
} from '../constants';
import { generateSecureToken } from '../handlers/shared/generate-secure-token';
import { generateVerificationCode } from '../handlers/shared/generate-verification-code';
import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository';
import type { EmailService } from '../ports/email.service';
import { TokenHasher } from './token-hasher.service';

export interface VerificationEmailRecipient {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly locale: string | null;
}

/** Mints a verification link token and a code, stores their hashes, and emails both. */
@Injectable()
export class VerificationEmailIssuer {
  private readonly logger = new Logger(VerificationEmailIssuer.name);

  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepository: EmailVerificationTokenRepository,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher
  ) {}

  async issue(
    recipient: VerificationEmailRecipient
  ): Promise<Result<void, AuthDomainError>> {
    const { plainToken, tokenHash } = generateSecureToken(this.tokenHasher);
    const { plainCode, codeHash } = generateVerificationCode(this.tokenHasher);

    const createResult = await this.verificationTokenRepository.create({
      userId: recipient.id,
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
      recipient.email,
      { token: plainToken, code: plainCode },
      recipient.name,
      recipient.locale ?? undefined
    );
    if (emailResult.isErr()) {
      this.logger.error('Failed to send verification email');
      return err(AuthErrors.emailSendFailed());
    }

    return ok(undefined);
  }
}
