import type { PasswordHasher } from '@jovandyaz/auth-nestjs';
import { AuthErrors } from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import { err, ok, type Result } from 'neverthrow';

const DEFAULT_SALT_ROUNDS = 12;

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  private readonly saltRounds: number;

  constructor(configService: ConfigService) {
    this.saltRounds =
      configService.get<number>('BCRYPT_ROUNDS') ?? DEFAULT_SALT_ROUNDS;
  }

  async hash(password: string): Promise<Result<string, AuthDomainError>> {
    try {
      const hashedPassword = await hash(password, this.saltRounds);
      return ok(hashedPassword);
    } catch {
      return err(AuthErrors.invalidPassword());
    }
  }

  async verify(
    password: string,
    hashedPassword: string
  ): Promise<Result<boolean, AuthDomainError>> {
    try {
      const isValid = await compare(password, hashedPassword);
      return ok(isValid);
    } catch {
      return err(AuthErrors.invalidPassword());
    }
  }
}
