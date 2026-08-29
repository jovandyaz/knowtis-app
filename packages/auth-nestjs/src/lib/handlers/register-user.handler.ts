import {
  AuthErrors,
  AuthEventName,
  Email,
  Password,
  UserRegisteredEvent,
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
  PASSWORD_HASHER,
  SESSION_REPOSITORY,
  TOKEN_HASHER,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from '../constants';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { SessionRepository } from '../ports/session.repository';
import type { TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { VerificationEmailIssuer } from '../services/verification-email-issuer.service';
import { createSessionWithTokens } from './shared/create-session';

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
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher,
    private readonly verificationEmailIssuer: VerificationEmailIssuer,
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

    this.verificationEmailIssuer.issue(user).catch((error) => {
      this.logger.error(
        'Unexpected error sending verification email',
        error instanceof Error ? error.stack : error
      );
    });

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
}
