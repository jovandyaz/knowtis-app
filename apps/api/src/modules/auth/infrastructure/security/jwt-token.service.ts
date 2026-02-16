import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { err, ok, type Result } from 'neverthrow';

import {
  AuthErrors,
  type AuthDomainError,
} from '../../domain/errors/auth.errors';
import type {
  AuthTokens,
  JwtPayload,
  TokenService,
} from '../../domain/ports/token.service';
import type { UserId } from '../../domain/value-objects/user-id.vo';

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async generateTokens(
    userId: UserId,
    email: string
  ): Promise<Result<AuthTokens, AuthDomainError>> {
    try {
      const payload: JwtPayload = { sub: userId.value, email };

      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(payload, {
          secret: this.configService.getOrThrow('JWT_SECRET'),
          expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
        }),
        this.jwtService.signAsync(payload, {
          secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
        }),
      ]);

      return ok({ accessToken, refreshToken });
    } catch {
      return err(AuthErrors.invalidRefreshToken());
    }
  }

  async verifyRefreshToken(
    token: string
  ): Promise<Result<JwtPayload, AuthDomainError>> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      });

      return ok({ sub: payload.sub, email: payload.email });
    } catch {
      return err(AuthErrors.invalidRefreshToken());
    }
  }
}
