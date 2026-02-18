import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-local';

import type { LoginUserHandler } from '../handlers/login-user.handler';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly loginHandler: LoginUserHandler) {
    super({
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, email: string, password: string) {
    const result = await this.loginHandler.validateCredentials({
      email,
      password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (result.isErr()) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return result.value;
  }
}
