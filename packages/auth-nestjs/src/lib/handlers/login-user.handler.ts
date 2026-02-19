import {
  AuthErrors,
  AuthEventName,
  Email,
  LoginFailedEvent,
  UserLoggedInEvent,
} from '@jovandyaz/auth';
import type {
  AuthDomainError,
  AuthTokens,
  SessionContext,
} from '@jovandyaz/auth';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  PASSWORD_HASHER,
  SESSION_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from '../constants';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { SessionRepository } from '../ports/session.repository';
import type { TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';
import { createSessionWithTokens } from './shared/create-session';

export interface ValidateUserInput {
  readonly email: string;
  readonly password: string;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface ValidatedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
}

export interface LoginUserOutput {
  readonly user: ValidatedUser;
  readonly tokens: AuthTokens;
}

@Injectable()
export class LoginUserHandler {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async validateCredentials(
    input: ValidateUserInput
  ): Promise<Result<ValidatedUser, AuthDomainError>> {
    const emailResult = Email.create(input.email);
    if (emailResult.isErr()) {
      this.emitLoginFailed(input.email, {
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      return err(AuthErrors.invalidCredentials());
    }
    const email = emailResult.value;

    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.passwordHash) {
      this.emitLoginFailed(input.email, {
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      return err(AuthErrors.invalidCredentials());
    }

    const verifyResult = await this.passwordHasher.verify(
      input.password,
      user.passwordHash
    );
    if (verifyResult.isErr()) {
      this.emitLoginFailed(input.email, {
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      return err(AuthErrors.invalidCredentials());
    }
    if (!verifyResult.value) {
      this.emitLoginFailed(input.email, {
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      return err(AuthErrors.invalidCredentials());
    }

    return ok({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });
  }

  async login(
    user: ValidatedUser,
    context: SessionContext = {}
  ): Promise<Result<LoginUserOutput, AuthDomainError>> {
    const tokensResult = await createSessionWithTokens(
      {
        tokenService: this.tokenService,
        sessionRepository: this.sessionRepository,
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

    this.eventEmitter.emit(
      AuthEventName.LOGIN,
      new UserLoggedInEvent(
        user.id,
        user.email,
        context.ipAddress ?? '',
        context.userAgent ?? '',
        new Date()
      )
    );

    return ok({
      user,
      tokens,
    });
  }

  private emitLoginFailed(
    email: string,
    context?: { ipAddress?: string | undefined; userAgent?: string | undefined }
  ): void {
    this.eventEmitter.emit(
      AuthEventName.LOGIN_FAILED,
      new LoginFailedEvent(
        email,
        context?.ipAddress ?? '',
        context?.userAgent ?? '',
        new Date()
      )
    );
  }
}
