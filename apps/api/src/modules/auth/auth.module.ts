import { AuthNestjsModule } from '@jovandyaz/auth-nestjs';
import { AuthEmailService } from '@jovandyaz/email-nestjs';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';

import { UsersModule } from '../users';
import { AnonymousAuthService } from './application/services/anonymous-auth.service';
import { AuthAccountController } from './auth-account.controller';
import { AuthSessionController } from './auth-session.controller';
import { DrizzleAnonymousDataMigrationRepository } from './infrastructure/persistence/drizzle-anonymous-data-migration.repository';
import { DrizzleEmailVerificationTokenRepository } from './infrastructure/persistence/drizzle-email-verification-token.repository';
import { DrizzlePasswordResetTokenRepository } from './infrastructure/persistence/drizzle-password-reset-token.repository';
import { DrizzleSessionRepository } from './infrastructure/persistence/drizzle-session.repository';
import { DrizzleUserRepository } from './infrastructure/persistence/drizzle-user.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/security/jwt-token.service';
import { CleanupAnonymousTask } from './tasks/cleanup-anonymous.task';

const configService = new ConfigService();

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    }),
    AuthNestjsModule.register({
      imports: [UsersModule],
      tokenConfig: {
        accessTokenSecret: configService.getOrThrow('JWT_SECRET'),
        refreshTokenSecret: configService.getOrThrow('JWT_REFRESH_SECRET'),
        accessTokenExpiresIn: configService.get<JwtSignOptions['expiresIn']>(
          'JWT_EXPIRES_IN',
          '15m'
        ),
        refreshTokenExpiresIn: configService.get(
          'JWT_REFRESH_EXPIRES_IN',
          '7d'
        ),
      },
      userRepository: DrizzleUserRepository,
      sessionRepository: DrizzleSessionRepository,
      tokenService: JwtTokenService,
      passwordHasher: BcryptPasswordHasher,
      emailService: AuthEmailService,
      useExistingEmailService: true,
      emailVerificationTokenRepository: DrizzleEmailVerificationTokenRepository,
      passwordResetTokenRepository: DrizzlePasswordResetTokenRepository,
    }),
  ],
  controllers: [AuthSessionController, AuthAccountController],
  providers: [
    AnonymousAuthService,
    DrizzleAnonymousDataMigrationRepository,
    CleanupAnonymousTask,
  ],
  exports: [AnonymousAuthService],
})
export class AuthModule {}
