import { AuthNestjsModule } from '@jovandyaz/auth-nestjs';
import { AuthEmailService } from '@jovandyaz/email-nestjs';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { UsersModule } from '../users';
import { AuthController } from './auth.controller';
import { DrizzleEmailVerificationTokenRepository } from './infrastructure/persistence/drizzle-email-verification-token.repository';
import { DrizzlePasswordResetTokenRepository } from './infrastructure/persistence/drizzle-password-reset-token.repository';
import { DrizzleSessionRepository } from './infrastructure/persistence/drizzle-session.repository';
import { DrizzleUserRepository } from './infrastructure/persistence/drizzle-user.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/security/jwt-token.service';

const configService = new ConfigService();

@Module({
  imports: [
    AuthNestjsModule.register({
      imports: [UsersModule],
      tokenConfig: {
        accessTokenSecret: configService.getOrThrow('JWT_SECRET'),
        refreshTokenSecret: configService.getOrThrow('JWT_REFRESH_SECRET'),
        accessTokenExpiresIn: configService.get('JWT_EXPIRES_IN', '15m'),
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
  controllers: [AuthController],
})
export class AuthModule {}
