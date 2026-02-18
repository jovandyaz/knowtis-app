import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  SESSION_EXPIRY_MS,
  VERIFICATION_TOKEN_EXPIRY_MS,
} from '../../../../auth/src/lib/constants';
import { AuthErrors } from '../../../../auth/src/lib/errors/auth.errors';
import type { AuthDomainError } from '../../../../auth/src/lib/errors/auth.errors';
import {
  AuthEventName,
  UserRegisteredEvent,
} from '../../../../auth/src/lib/events/auth.events';
import type { SessionContext } from '../../../../auth/src/lib/session/session.types';
import { hashToken } from '../../../../auth/src/lib/tokens/hash-token';
import { Email } from '../../../../auth/src/lib/value-objects/email.vo';
import { Password } from '../../../../auth/src/lib/value-objects/password.vo';
import { UserId } from '../../../../auth/src/lib/value-objects/user-id.vo';
import {
  EMAIL_SERVICE,
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  PASSWORD_HASHER,
  SESSION_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from '../constants';
import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository';
import type { EmailService } from '../ports/email.service';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { SessionRepository } from '../ports/session.repository';
import type { AuthTokens, TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';

export interface RegisterUserInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

export interface RegisterUserOutput {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly avatarUrl: string | null;
  };
  readonly tokens: AuthTokens;
}

export type RegisterSessionContext = SessionContext;

@Injectable()
export class RegisterUserHandler {
  private readonly logger = new Logger(RegisterUserHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepository: EmailVerificationTokenRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: RegisterUserInput,
    context: RegisterSessionContext = {}
  ): Promise<Result<RegisterUserOutput, AuthDomainError>> {
    const emailResult = Email.create(input.email);
    if (emailResult.isErr()) {
      return err(emailResult.error);
    }
    const email = emailResult.value;

    const passwordResult = Password.create(input.password);
    if (passwordResult.isErr()) {
      return err(passwordResult.error);
    }

    const emailExists = await this.userRepository.emailExists(email);
    if (emailExists) {
      return err(AuthErrors.emailAlreadyExists(email.value));
    }

    const hashResult = await this.passwordHasher.hash(input.password);
    if (hashResult.isErr()) {
      return err(hashResult.error);
    }

    const createResult = await this.userRepository.create({
      email: email.value,
      name: input.name,
      passwordHash: hashResult.value,
    });
    if (createResult.isErr()) {
      return err(createResult.error);
    }
    const user = createResult.value;

    const tokensResult = await this.tokenService.generateTokens(
      UserId.fromTrusted(user.id),
      user.email
    );
    if (tokensResult.isErr()) {
      return err(tokensResult.error);
    }

    const tokens = tokensResult.value;

    const sessionResult = await this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash: hashToken(tokens.refreshToken),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
    });
    if (sessionResult.isErr()) {
      return err(sessionResult.error);
    }

    // Fire-and-forget: send verification email (don't fail registration)
    this.sendVerificationEmail(user.id, user.email, user.name).catch(
      (error) => {
        this.logger.error(
          'Unexpected error sending verification email',
          error instanceof Error ? error.stack : error
        );
      }
    );

    this.eventEmitter.emit(
      AuthEventName.REGISTER,
      new UserRegisteredEvent(
        user.id,
        user.email,
        context.ipAddress ?? '',
        context.userAgent ?? '',
        new Date()
      )
    );

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      tokens,
    });
  }

  private async sendVerificationEmail(
    userId: string,
    email: string,
    name: string
  ): Promise<void> {
    const plainToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(plainToken);

    const createResult = await this.verificationTokenRepository.create({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS),
    });
    if (createResult.isErr()) {
      this.logger.error('Failed to create email verification token');
      return;
    }

    const emailResult = await this.emailService.sendEmailVerification(
      email,
      plainToken,
      name
    );
    if (emailResult.isErr()) {
      this.logger.error('Failed to send verification email');
    }
  }
}
