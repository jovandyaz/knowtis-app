import { AuthNestjsModule } from '@jovandyaz/auth-nestjs';
import { AuthEmailService } from '@jovandyaz/email-nestjs';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';

import type { EnvConfig } from '../../config/env.config';
import { deriveOauthPublicKeys } from '../../config/oauth-public-keys';
import { UsersModule } from '../users';
import { AnonymousAuthService } from './application/services/anonymous-auth.service';
import { AuthAccountController } from './auth-account.controller';
import { AuthSessionController } from './auth-session.controller';
import { DrizzleAnonymousDataMigrationRepository } from './infrastructure/persistence/drizzle-anonymous-data-migration.repository';
import { DrizzleAnonymousUserRepository } from './infrastructure/persistence/drizzle-anonymous-user.repository';
import { DrizzleEmailVerificationTokenRepository } from './infrastructure/persistence/drizzle-email-verification-token.repository';
import { DrizzlePasswordResetTokenRepository } from './infrastructure/persistence/drizzle-password-reset-token.repository';
import { DrizzleSessionRepository } from './infrastructure/persistence/drizzle-session.repository';
import { DrizzleUserRepository } from './infrastructure/persistence/drizzle-user.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/security/jwt-token.service';
import { AuthCleanupTask } from './tasks/auth-cleanup.task';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    }),
    AuthNestjsModule.registerAsync({
      imports: [UsersModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        tokenConfig: {
          accessTokenSecret: config.getOrThrow('JWT_SECRET', { infer: true }),
          refreshTokenSecret: config.getOrThrow('JWT_REFRESH_SECRET', {
            infer: true,
          }),
          accessTokenExpiresIn: config.get<JwtSignOptions['expiresIn']>(
            'JWT_EXPIRES_IN',
            '15m'
          ),
          refreshTokenExpiresIn: config.get('JWT_REFRESH_EXPIRES_IN', '7d', {
            infer: true,
          }),
          additionalPublicKeys: deriveOauthPublicKeys(
            config.get('OAUTH_JWKS', { infer: true })
          ),
        },
        tokenHashKey: config.getOrThrow('TOKEN_HASH_KEY', { infer: true }),
      }),
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
    DrizzleAnonymousUserRepository,
    AuthCleanupTask,
  ],
  exports: [AnonymousAuthService, AuthNestjsModule],
})
export class AuthModule {}
