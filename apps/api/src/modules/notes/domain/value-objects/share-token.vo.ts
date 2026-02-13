import { randomBytes } from 'crypto';

import { err, ok, type Result } from 'neverthrow';

import { NoteErrors, type NoteDomainError } from '../errors';

export class ShareToken {
  private constructor(public readonly value: string) {}

  static create(token: string): Result<ShareToken, NoteDomainError> {
    if (!token || token.trim().length === 0) {
      return err(NoteErrors.invalidShareToken('Token cannot be empty'));
    }
    return ok(new ShareToken(token.trim()));
  }

  static generate(): Result<ShareToken, NoteDomainError> {
    const token = randomBytes(16).toString('hex');
    return ok(new ShareToken(token));
  }

  toPrimitive(): string {
    return this.value;
  }
}
