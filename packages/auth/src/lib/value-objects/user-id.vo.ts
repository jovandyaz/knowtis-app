import { err, ok, type Result } from 'neverthrow';

import { AuthErrors, type AuthDomainError } from '../errors/auth.errors';

export class UserId {
  private constructor(public readonly value: string) {}

  static create(id: string): Result<UserId, AuthDomainError> {
    if (!id || id.trim().length === 0) {
      return err(AuthErrors.invalidUserId('cannot be empty'));
    }

    return ok(new UserId(id));
  }

  static fromTrusted(id: string): UserId {
    return new UserId(id);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toPrimitive(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }
}
