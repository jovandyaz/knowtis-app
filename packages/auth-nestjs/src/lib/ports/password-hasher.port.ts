import type { Result } from 'neverthrow';

import type { AuthDomainError } from '../../../../auth/src/lib/errors/auth.errors';

export interface PasswordHasher {
  hash(password: string): Promise<Result<string, AuthDomainError>>;
  verify(
    password: string,
    hash: string
  ): Promise<Result<boolean, AuthDomainError>>;
}

export { PASSWORD_HASHER } from '../constants';
