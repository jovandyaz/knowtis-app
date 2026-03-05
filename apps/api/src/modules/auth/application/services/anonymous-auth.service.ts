import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../../../users/users.service';

export interface AnonymousSession {
  user: {
    id: string;
    name: string;
    isAnonymous: boolean;
  };
  accessToken: string;
}

@Injectable()
export class AnonymousAuthService {
  private static readonly ANONYMOUS_TOKEN_EXPIRY = '30d';

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async createAnonymousSession(): Promise<AnonymousSession> {
    const anonymousEmail = `anon-${randomUUID()}@anonymous.knowtis.local`;

    const user = await this.usersService.create({
      email: anonymousEmail,
      name: 'Anonymous',
      passwordHash: '!anonymous-no-login',
      provider: 'anonymous',
      isAnonymous: true,
    });

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, isAnonymous: true },
      {
        secret: this.configService.getOrThrow('JWT_SECRET'),
        expiresIn: AnonymousAuthService.ANONYMOUS_TOKEN_EXPIRY,
      }
    );

    return {
      user: {
        id: user.id,
        name: 'Anonymous',
        isAnonymous: true,
      },
      accessToken,
    };
  }
}
