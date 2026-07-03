import {
  Module,
  type DynamicModule,
  type Provider,
  type Type,
} from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import {
  AUTH_MODULE_OPTIONS,
  EMAIL_SERVICE,
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  PASSWORD_HASHER,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  SESSION_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './constants';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { ForgotPasswordHandler } from './handlers/forgot-password.handler';
import { LoginUserHandler } from './handlers/login-user.handler';
import { LogoutUserHandler } from './handlers/logout-user.handler';
import { RefreshTokensHandler } from './handlers/refresh-tokens.handler';
import { RegisterUserHandler } from './handlers/register-user.handler';
import { ResendVerificationHandler } from './handlers/resend-verification.handler';
import { ResetPasswordHandler } from './handlers/reset-password.handler';
import { VerifyEmailHandler } from './handlers/verify-email.handler';
import { AuthAuditListener } from './logging/auth-audit.listener';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

export interface TokenConfig {
  readonly accessTokenSecret: string;
  readonly refreshTokenSecret: string;
  readonly accessTokenExpiresIn?: JwtSignOptions['expiresIn'];
  readonly refreshTokenExpiresIn?: string;
  /** PEM-encoded public keys for asymmetric (ES256) verification. Empty = HS256-only. */
  readonly additionalPublicKeys?: string[];
}

type InjectableClass = Type<any>;

export interface AuthModuleOptions {
  readonly tokenConfig: TokenConfig;
  readonly passwordSaltRounds?: number;
  readonly imports?: Array<Type<any> | DynamicModule>;
  readonly userRepository: InjectableClass;
  readonly sessionRepository: InjectableClass;
  readonly tokenService: InjectableClass;
  readonly passwordHasher: InjectableClass;
  readonly emailService?: InjectableClass;
  readonly useExistingEmailService?: boolean;
  readonly emailVerificationTokenRepository?: InjectableClass;
  readonly passwordResetTokenRepository?: InjectableClass;
}

const HANDLERS = [
  LoginUserHandler,
  RegisterUserHandler,
  RefreshTokensHandler,
  LogoutUserHandler,
  ForgotPasswordHandler,
  ResetPasswordHandler,
  VerifyEmailHandler,
  ResendVerificationHandler,
];

@Module({})
export class AuthNestjsModule {
  static register(options: AuthModuleOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: AUTH_MODULE_OPTIONS,
        useValue: options,
      },
      {
        provide: USER_REPOSITORY,
        useClass: options.userRepository,
      },
      {
        provide: SESSION_REPOSITORY,
        useClass: options.sessionRepository,
      },
      {
        provide: TOKEN_SERVICE,
        useClass: options.tokenService,
      },
      {
        provide: PASSWORD_HASHER,
        useClass: options.passwordHasher,
      },
      JwtStrategy,
      LocalStrategy,
      JwtAuthGuard,
      LocalAuthGuard,
      AuthAuditListener,
      ...HANDLERS,
    ];

    if (options.emailService) {
      providers.push(
        options.useExistingEmailService
          ? { provide: EMAIL_SERVICE, useExisting: options.emailService }
          : { provide: EMAIL_SERVICE, useClass: options.emailService }
      );
    }

    if (options.emailVerificationTokenRepository) {
      providers.push({
        provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY,
        useClass: options.emailVerificationTokenRepository,
      });
    }

    if (options.passwordResetTokenRepository) {
      providers.push({
        provide: PASSWORD_RESET_TOKEN_REPOSITORY,
        useClass: options.passwordResetTokenRepository,
      });
    }

    return {
      module: AuthNestjsModule,
      imports: [
        PassportModule,
        ...(options.imports ?? []),
        JwtModule.register({
          secret: options.tokenConfig.accessTokenSecret,
          signOptions: {
            algorithm: 'HS256',
            expiresIn: options.tokenConfig.accessTokenExpiresIn ?? '15m',
          },
          verifyOptions: { algorithms: ['HS256'] },
        }),
      ],
      providers,
      exports: [
        AUTH_MODULE_OPTIONS,
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        TOKEN_SERVICE,
        PASSWORD_HASHER,
        ...(options.emailService ? [EMAIL_SERVICE] : []),
        ...(options.emailVerificationTokenRepository
          ? [EMAIL_VERIFICATION_TOKEN_REPOSITORY]
          : []),
        ...(options.passwordResetTokenRepository
          ? [PASSWORD_RESET_TOKEN_REPOSITORY]
          : []),
        JwtAuthGuard,
        LocalAuthGuard,
        ...HANDLERS,
      ],
    };
  }
}
