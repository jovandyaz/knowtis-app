import {
  AuthErrors,
  AuthEventName,
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
  Password,
  PasswordResetCompletedEvent,
  UserId,
} from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  PASSWORD_HASHER,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  SESSION_REPOSITORY,
  TOKEN_HASHER,
  USER_REPOSITORY,
} from '../constants';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { PasswordResetTokenRepository } from '../ports/password-reset-token.repository';
import type { SessionRepository } from '../ports/session.repository';
import type { UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';

export interface ResetPasswordInput {
  readonly token: string;
  readonly newPassword: string;
}

@Injectable()
export class ResetPasswordHandler {
  private readonly logger = new Logger(ResetPasswordHandler.name);

  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokenRepository: PasswordResetTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository,
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: ResetPasswordInput
  ): Promise<Result<void, AuthDomainError>> {
    const passwordResult = Password.create(input.newPassword);
    if (passwordResult.isErr()) {
      return err(passwordResult.error);
    }

    const tokenHash = this.tokenHasher.hash(input.token);
    const resetToken =
      await this.resetTokenRepository.findByTokenHash(tokenHash);

    if (!resetToken) {
      return err(AuthErrors.invalidResetToken());
    }

    if (resetToken.expiresAt < new Date()) {
      await this.resetTokenRepository.deleteAllByUserId(resetToken.userId);
      return err(AuthErrors.resetTokenExpired());
    }

    const userId = UserId.fromTrusted(resetToken.userId);
    const user = await this.userRepository.findById(userId);
    if (!user) {
      await this.resetTokenRepository.deleteAllByUserId(resetToken.userId);
      return err(AuthErrors.userNotFound(resetToken.userId));
    }

    const hashResult = await this.passwordHasher.hash(input.newPassword);
    if (hashResult.isErr()) {
      return err(hashResult.error);
    }

    const updateResult = await this.userRepository.updatePasswordHash(
      userId,
      hashResult.value
    );
    if (updateResult.isErr()) {
      return err(updateResult.error);
    }

    await this.resetTokenRepository.deleteAllByUserId(resetToken.userId);
    await this.sessionRepository.deleteAllByUserId(resetToken.userId);

    if (!user.emailVerifiedAt) {
      // Reading the reset link proves inbox ownership — that is how the owner
      // reclaims an address someone else registered. The password already
      // changed, so a failed flag write must not report the reset as failed.
      const verifyResult = await this.userRepository.markEmailVerified(userId);
      if (verifyResult.isErr()) {
        this.logger.error(
          `Failed to mark email verified after password reset for user ${resetToken.userId}`
        );
      } else {
        this.eventEmitter.emit(
          AuthEventName.EMAIL_VERIFIED,
          new EmailVerifiedEvent(
            resetToken.userId,
            EMAIL_VERIFICATION_SOURCE.PASSWORD_RESET,
            new Date()
          )
        );
      }
    }

    this.logger.log(`Password reset successful for user ${resetToken.userId}`);

    this.eventEmitter.emit(
      AuthEventName.PASSWORD_RESET_COMPLETED,
      new PasswordResetCompletedEvent(resetToken.userId, new Date())
    );

    return ok(undefined);
  }
}
