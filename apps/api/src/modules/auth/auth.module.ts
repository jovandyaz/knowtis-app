import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersModule } from '../users';
import { ForgotPasswordHandler } from './application/handlers/forgot-password.handler';
import { LoginUserHandler } from './application/handlers/login-user.handler';
import { LogoutUserHandler } from './application/handlers/logout-user.handler';
import { RefreshTokensHandler } from './application/handlers/refresh-tokens.handler';
import { RegisterUserHandler } from './application/handlers/register-user.handler';
import { ResendVerificationHandler } from './application/handlers/resend-verification.handler';
import { ResetPasswordHandler } from './application/handlers/reset-password.handler';
import { VerifyEmailHandler } from './application/handlers/verify-email.handler';
import { AuthController } from './auth.controller';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './domain/ports/email-verification-token.repository';
import { EMAIL_SERVICE } from './domain/ports/email.service';
import { PASSWORD_HASHER } from './domain/ports/password-hasher.port';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './domain/ports/password-reset-token.repository';
import { SESSION_REPOSITORY } from './domain/ports/session.repository';
import { TOKEN_SERVICE } from './domain/ports/token.service';
import { USER_REPOSITORY } from './domain/ports/user.repository';
import { ConsoleEmailService } from './infrastructure/email/console-email.service';
import { AuthAuditListener } from './infrastructure/logging/auth-audit.listener';
import { DrizzleEmailVerificationTokenRepository } from './infrastructure/persistence/drizzle-email-verification-token.repository';
import { DrizzlePasswordResetTokenRepository } from './infrastructure/persistence/drizzle-password-reset-token.repository';
import { DrizzleSessionRepository } from './infrastructure/persistence/drizzle-session.repository';
import { DrizzleUserRepository } from './infrastructure/persistence/drizzle-user.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/security/jwt-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '15m'),
        },
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    LocalStrategy,
    JwtStrategy,
    AuthAuditListener,
    RegisterUserHandler,
    LoginUserHandler,
    RefreshTokensHandler,
    LogoutUserHandler,
    ForgotPasswordHandler,
    ResetPasswordHandler,
    VerifyEmailHandler,
    ResendVerificationHandler,
    {
      provide: PASSWORD_HASHER,
      useClass: BcryptPasswordHasher,
    },
    {
      provide: TOKEN_SERVICE,
      useClass: JwtTokenService,
    },
    {
      provide: USER_REPOSITORY,
      useClass: DrizzleUserRepository,
    },
    {
      provide: SESSION_REPOSITORY,
      useClass: DrizzleSessionRepository,
    },
    {
      provide: PASSWORD_RESET_TOKEN_REPOSITORY,
      useClass: DrizzlePasswordResetTokenRepository,
    },
    {
      provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY,
      useClass: DrizzleEmailVerificationTokenRepository,
    },
    {
      provide: EMAIL_SERVICE,
      useClass: ConsoleEmailService,
    },
  ],
  exports: [LoginUserHandler],
})
export class AuthModule {}
