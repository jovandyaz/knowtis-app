import {
  AuthEventName,
  Email,
  PasswordResetRequestedEvent,
  RESET_TOKEN_EXPIRY_MS,
} from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ok, type Result } from 'neverthrow';

import {
  EMAIL_SERVICE,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  TOKEN_HASHER,
  USER_REPOSITORY,
} from '../constants';
import type { EmailService } from '../ports/email.service';
import type { PasswordResetTokenRepository } from '../ports/password-reset-token.repository';
import type { UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { generateSecureToken } from './shared/generate-secure-token';

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
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: ForgotPasswordInput
  ): Promise<Result<void, AuthDomainError>> {
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

    await this.resetTokenRepository.deleteAllByUserId(user.id);

    const { plainToken, tokenHash } = generateSecureToken(this.tokenHasher);

    const createResult = await this.resetTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
    });
    if (createResult.isErr()) {
      this.logger.error('Failed to create password reset token');
      return ok(undefined);
    }

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
