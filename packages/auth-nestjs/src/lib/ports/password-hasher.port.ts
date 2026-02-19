import type { AuthDomainError } from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

export interface PasswordHasher {
  hash(password: string): Promise<Result<string, AuthDomainError>>;
  verify(
    password: string,
    hash: string
  ): Promise<Result<boolean, AuthDomainError>>;
}
