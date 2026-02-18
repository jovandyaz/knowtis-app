import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ok, type Result } from 'neverthrow';

import { RESET_TOKEN_EXPIRY_MS } from '../../../../auth/src/lib/constants';
import type { AuthDomainError } from '../../../../auth/src/lib/errors/auth.errors';
import {
  AuthEventName,
  PasswordResetRequestedEvent,
} from '../../../../auth/src/lib/events/auth.events';
import { hashToken } from '../../../../auth/src/lib/tokens/hash-token';
import { Email } from '../../../../auth/src/lib/value-objects/email.vo';
import {
  EMAIL_SERVICE,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '../constants';
import type { EmailService } from '../ports/email.service';
import type { PasswordResetTokenRepository } from '../ports/password-reset-token.repository';
import type { UserRepository } from '../ports/user.repository';

export interface ForgotPasswordInput {
  readonly email: string;
}

@Injectable()
export class ForgotPasswordHandler {
  private readonly logger = new Logger(ForgotPasswordHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokenRepository: PasswordResetTokenRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: ForgotPasswordInput
  ): Promise<Result<void, AuthDomainError>> {
    // Always return success to prevent email enumeration
    const emailResult = Email.create(input.email);
    if (emailResult.isErr()) {
      return ok(undefined);
    }
    const email = emailResult.value;

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      this.logger.debug(
        'Forgot password requested for non-existent email — returning success silently'
      );
      return ok(undefined);
    }

    // Delete any existing reset tokens for this user
    await this.resetTokenRepository.deleteAllByUserId(user.id);

    // Generate a random token and hash it for storage
    const plainToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(plainToken);

    const createResult = await this.resetTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
    });
    if (createResult.isErr()) {
      this.logger.error('Failed to create password reset token');
      return ok(undefined);
    }

    // Send email (fire-and-forget for security — don't reveal failures)
    const sendResult = await this.emailService.sendPasswordReset(
      user.email,
      plainToken,
      user.name
    );
    if (sendResult.isErr()) {
      this.logger.error('Failed to send password reset email');
    }

    this.eventEmitter.emit(
      AuthEventName.PASSWORD_RESET_REQUESTED,
      new PasswordResetRequestedEvent(user.email, new Date())
    );

    return ok(undefined);
  }
}
