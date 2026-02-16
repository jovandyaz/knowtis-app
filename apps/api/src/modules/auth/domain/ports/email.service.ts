import type { Result } from 'neverthrow';

import type { AuthDomainError } from '../errors/auth.errors';

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

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
