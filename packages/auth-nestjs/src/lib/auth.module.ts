import {
  Module,
  type DynamicModule,
  type FactoryProvider,
  type InjectionToken,
  type ModuleMetadata,
  type Provider,
  type Type,
} from '@nestjs/common';
import {
  JwtModule,
  type JwtModuleOptions,
  type JwtSignOptions,
} from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import {
  AUTH_MODULE_OPTIONS,
  EMAIL_SERVICE,
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  JWT_VERIFICATION_KEY_SELECTOR,
  PASSWORD_HASHER,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  SESSION_REPOSITORY,
  TOKEN_HASHER,
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
import { VerifyEmailCodeHandler } from './handlers/verify-email-code.handler';
import { VerifyEmailHandler } from './handlers/verify-email.handler';
import { createJwtVerificationKeySelector } from './jwt-verification-key-selector';
import { AuthAuditListener } from './logging/auth-audit.listener';
import type { OauthPublicKey } from './oauth-public-key';
import { TokenHasher } from './services/token-hasher.service';
import { VerificationEmailIssuer } from './services/verification-email-issuer.service';
import { JwtStrategy, OauthJwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

export interface TokenConfig {
  readonly accessTokenSecret: string;
  readonly refreshTokenSecret: string;
  readonly accessTokenExpiresIn?: JwtSignOptions['expiresIn'];
  readonly refreshTokenExpiresIn?: string;
  /** Public keys for asymmetric (ES256) verification. Empty = HS256-only. */
  readonly additionalPublicKeys?: readonly OauthPublicKey[];
}

type InjectableClass = Type<any>;

export interface AuthSecretsOptions {
  readonly tokenConfig: TokenConfig;
  /** Server-side secret keying every stored token hash. 32 bytes, base64. */
  readonly tokenHashKey: string;
  readonly passwordSaltRounds?: number;
}

export interface AuthModuleAsyncOptions {
  /** Modules the port classes depend on, and the factory's `inject` sources. */
  readonly imports?: ModuleMetadata['imports'];
  readonly inject?: Array<InjectionToken>;
  readonly useFactory: (
    ...args: never[]
  ) => AuthSecretsOptions | Promise<AuthSecretsOptions>;
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
  VerifyEmailCodeHandler,
  ResendVerificationHandler,
];

@Module({})
class AuthOptionsModule {}

@Module({})
export class AuthNestjsModule {
  static registerAsync(options: AuthModuleAsyncOptions): DynamicModule {
    // One shared instance, so JwtModule's factory and this module's providers
    // read the same resolved options and the consumer's factory runs once.
    const optionsModule: DynamicModule = {
      module: AuthOptionsModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: AUTH_MODULE_OPTIONS,
          // The public never[] params cannot widen to Nest's any[] slot unasserted;
          // Nest passes the resolved `inject` values at runtime.
          useFactory:
            options.useFactory as FactoryProvider<AuthSecretsOptions>['useFactory'],
          inject: options.inject ?? [],
        },
      ],
      exports: [AUTH_MODULE_OPTIONS],
    };

    const providers: Provider[] = [
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
      {
        provide: TOKEN_HASHER,
        useFactory: ({ tokenHashKey }: AuthSecretsOptions) =>
          new TokenHasher(tokenHashKey),
        inject: [AUTH_MODULE_OPTIONS],
      },
      {
        provide: JWT_VERIFICATION_KEY_SELECTOR,
        useFactory: ({ tokenConfig }: AuthSecretsOptions) =>
          createJwtVerificationKeySelector(
            tokenConfig.accessTokenSecret,
            tokenConfig.additionalPublicKeys ?? []
          ),
        inject: [AUTH_MODULE_OPTIONS],
      },
      VerificationEmailIssuer,
      JwtStrategy,
      OauthJwtStrategy,
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
        optionsModule,
        JwtModule.registerAsync({
          imports: [optionsModule],
          inject: [AUTH_MODULE_OPTIONS],
          useFactory: ({
            tokenConfig,
          }: AuthSecretsOptions): JwtModuleOptions => ({
            secret: tokenConfig.accessTokenSecret,
            signOptions: {
              algorithm: 'HS256',
              expiresIn: tokenConfig.accessTokenExpiresIn ?? '15m',
            },
            verifyOptions: { algorithms: ['HS256'] },
          }),
        }),
      ],
      providers,
      exports: [
        optionsModule,
        JWT_VERIFICATION_KEY_SELECTOR,
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        TOKEN_SERVICE,
        PASSWORD_HASHER,
        TOKEN_HASHER,
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
