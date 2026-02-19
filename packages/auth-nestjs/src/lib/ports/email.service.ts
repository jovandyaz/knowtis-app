import type { AuthDomainError } from '@jovandyaz/auth/server';
import type { Result } from 'neverthrow';

export interface EmailService {
  sendPasswordReset(
    email: string,
    token: string,
    name: string
  ): Promise<Result<void, AuthDomainError>>;

  sendEmailVerification(
    email: string,
    token: string,
    name: string
  ): Promise<Result<void, AuthDomainError>>;
}
