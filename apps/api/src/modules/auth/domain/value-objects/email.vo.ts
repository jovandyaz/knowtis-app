import { err, ok, type Result } from 'neverthrow';

import { AuthErrors, type AuthDomainError } from '../errors/auth.errors';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(public readonly value: string) {}

  static create(email: string): Result<Email, AuthDomainError> {
    if (!email || !EMAIL_REGEX.test(email)) {
      return err(AuthErrors.invalidEmail(email ?? ''));
    }

    return ok(new Email(email.toLowerCase()));
  }

  static fromTrusted(email: string): Email {
    return new Email(email);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
