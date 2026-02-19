import { UserId } from '@jovandyaz/auth';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AuthModuleOptions } from '../auth.module';
import { AUTH_MODULE_OPTIONS, USER_REPOSITORY } from '../constants';
import type { UserRepository } from '../ports/user.repository';

export interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(AUTH_MODULE_OPTIONS) options: AuthModuleOptions,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: options.tokenConfig.accessTokenSecret,
    });
  }

  async validate(payload: JwtPayload) {
    try {
      const userId = UserId.fromTrusted(payload.sub);
      const user = await this.userRepository.findById(userId);

      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
