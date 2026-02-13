import { err, ok, type Result } from 'neverthrow';

import { NOTE_TITLE_MAX_LENGTH } from '@knowtis/shared-types';

import { NoteErrors, type NoteDomainError } from '../errors';

export class NoteTitle {
  private constructor(public readonly value: string) {}

  static create(title: string): Result<NoteTitle, NoteDomainError> {
    if (!title || title.trim().length === 0) {
      return err(NoteErrors.invalidTitle('Title cannot be empty'));
    }

    if (title.length > NOTE_TITLE_MAX_LENGTH) {
      return err(
        NoteErrors.invalidTitle(
          `Title cannot exceed ${NOTE_TITLE_MAX_LENGTH} characters`
        )
      );
    }

    return ok(new NoteTitle(title));
  }

  toPrimitive(): string {
    return this.value;
  }
}
