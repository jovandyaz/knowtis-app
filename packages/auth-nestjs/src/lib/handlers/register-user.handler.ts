import {
  AuthErrors,
  AuthEventName,
  Email,
  Password,
  UserRegisteredEvent,
  VERIFICATION_TOKEN_EXPIRY_MS,
} from '@jovandyaz/auth/server';
import type {
  AuthDomainError,
  AuthTokens,
  SessionContext,
} from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  EMAIL_SERVICE,
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  PASSWORD_HASHER,
  SESSION_REPOSITORY,
  TOKEN_HASHER,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from '../constants';
import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository';
import type { EmailService } from '../ports/email.service';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { SessionRepository } from '../ports/session.repository';
import type { TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { createSessionWithTokens } from './shared/create-session';
import { generateSecureToken } from './shared/generate-secure-token';

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
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: RegisterUserInput,
    context: SessionContext = {}
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

    const tokensResult = await createSessionWithTokens(
      {
        tokenService: this.tokenService,
        sessionRepository: this.sessionRepository,
        tokenHasher: this.tokenHasher,
      },
      {
        userId: user.id,
        email: user.email,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      }
    );
    if (tokensResult.isErr()) {
      return err(tokensResult.error);
    }

    const tokens = tokensResult.value;

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
    const { plainToken, tokenHash } = generateSecureToken(this.tokenHasher);

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
