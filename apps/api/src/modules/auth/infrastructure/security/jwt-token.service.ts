import type { JwtPayload, TokenService } from '@jovandyaz/auth-nestjs';
import { AuthErrors } from '@jovandyaz/auth/server';
import type {
  AuthDomainError,
  AuthTokens,
  UserId,
} from '@jovandyaz/auth/server';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { err, ok, type Result } from 'neverthrow';

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async generateTokens(
    userId: UserId,
    email: string,
    options?: { isAnonymous?: boolean; familyId?: string }
  ): Promise<Result<AuthTokens, AuthDomainError>> {
    try {
      const payload: JwtPayload = {
        sub: userId.value,
        email,
        ...(options?.isAnonymous && { isAnonymous: true }),
        ...(options?.familyId && { familyId: options.familyId }),
      };

      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(payload, {
          secret: this.configService.getOrThrow('JWT_SECRET'),
          expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
          algorithm: 'HS256',
        }),
        this.jwtService.signAsync(payload, {
          secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
          algorithm: 'HS256',
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
        algorithms: ['HS256'],
      });

      return ok({
        sub: payload.sub,
        email: payload.email,
        ...(payload.isAnonymous && { isAnonymous: true }),
        ...(payload.familyId && { familyId: payload.familyId }),
      });
    } catch {
      return err(AuthErrors.invalidRefreshToken());
    }
  }
}
