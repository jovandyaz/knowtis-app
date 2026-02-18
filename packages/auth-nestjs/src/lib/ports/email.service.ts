import type { Result } from 'neverthrow';

import type { AuthDomainError } from '../../../../auth/src/lib/errors/auth.errors';

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

export { EMAIL_SERVICE } from '../constants';
