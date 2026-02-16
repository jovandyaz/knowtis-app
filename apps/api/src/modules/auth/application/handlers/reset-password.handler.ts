import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  AuthErrors,
  type AuthDomainError,
} from '../../domain/errors/auth.errors';
import {
  AuthEventName,
  PasswordResetCompletedEvent,
} from '../../domain/events/auth.events';
import { hashToken } from '../../domain/hash-token';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../domain/ports/password-hasher.port';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../../domain/ports/password-reset-token.repository';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from '../../domain/ports/session.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/user.repository';
import { Password } from '../../domain/value-objects/password.vo';
import { UserId } from '../../domain/value-objects/user-id.vo';

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
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: ResetPasswordInput
  ): Promise<Result<void, AuthDomainError>> {
    // 1. Validate the new password meets requirements
    const passwordResult = Password.create(input.newPassword);
    if (passwordResult.isErr()) {
      return err(passwordResult.error);
    }

    // 2. Hash the incoming token and look it up
    const tokenHash = hashToken(input.token);
    const resetToken =
      await this.resetTokenRepository.findByTokenHash(tokenHash);

    if (!resetToken) {
      return err(AuthErrors.invalidResetToken());
    }

    // 3. Check if token is expired
    if (resetToken.expiresAt < new Date()) {
      // Clean up expired token
      await this.resetTokenRepository.deleteAllByUserId(resetToken.userId);
      return err(AuthErrors.resetTokenExpired());
    }

    // 4. Verify user still exists
    const userId = UserId.fromTrusted(resetToken.userId);
    const user = await this.userRepository.findById(userId);
    if (!user) {
      await this.resetTokenRepository.deleteAllByUserId(resetToken.userId);
      return err(AuthErrors.userNotFound(resetToken.userId));
    }

    // 5. Hash the new password
    const hashResult = await this.passwordHasher.hash(input.newPassword);
    if (hashResult.isErr()) {
      return err(hashResult.error);
    }

    // 6. Update user's password
    const updateResult = await this.userRepository.updatePasswordHash(
      userId,
      hashResult.value
    );
    if (updateResult.isErr()) {
      return err(updateResult.error);
    }

    // 7. Delete ALL reset tokens for this user
    await this.resetTokenRepository.deleteAllByUserId(resetToken.userId);

    // 8. Invalidate ALL sessions for this user (security measure)
    await this.sessionRepository.deleteAllByUserId(resetToken.userId);

    this.logger.log(`Password reset successful for user ${resetToken.userId}`);

    this.eventEmitter.emit(
      AuthEventName.PASSWORD_RESET_COMPLETED,
      new PasswordResetCompletedEvent(resetToken.userId, new Date())
    );

    return ok(undefined);
  }
}
