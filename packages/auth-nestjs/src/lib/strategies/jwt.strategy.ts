import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AuthModuleOptions } from '../auth.module';
import { AUTH_MODULE_OPTIONS, USER_REPOSITORY } from '../constants';
import type { JwtPayload } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';

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
        ...(payload.isAnonymous && { isAnonymous: true }),
      };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
