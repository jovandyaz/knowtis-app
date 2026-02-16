import type { Result } from 'neverthrow';

import type { AuthDomainError } from '../errors/auth.errors';

export interface PasswordHasher {
  hash(password: string): Promise<Result<string, AuthDomainError>>;
  verify(
    password: string,
    hash: string
  ): Promise<Result<boolean, AuthDomainError>>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
