import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { err, ok, type Result } from 'neverthrow';

import {
  AuthErrors,
  type AuthDomainError,
} from '../../domain/errors/auth.errors';
import type { PasswordHasher } from '../../domain/ports/password-hasher.port';

const SALT_ROUNDS = 10;

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<Result<string, AuthDomainError>> {
    try {
      const hashedPassword = await hash(password, SALT_ROUNDS);
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
