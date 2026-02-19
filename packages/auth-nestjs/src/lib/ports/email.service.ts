import type { AuthDomainError } from '@jovandyaz/auth';
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

export { EMAIL_SERVICE } from '../constants';
