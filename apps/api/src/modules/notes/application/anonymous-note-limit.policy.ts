import type { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { ANONYMOUS_LIMITS } from '@knowtis/shared-types';

import { UsersService } from '../../users/users.service';
import { NoteErrors, type NoteDomainError } from '../domain/errors/note.errors';
import {
  NOTE_READ_REPOSITORY,
  type NoteReadRepository,
} from '../domain/ports/note-read.repository';

@Injectable()
export class AnonymousNoteLimitPolicy {
  constructor(
    private readonly users: UsersService,
    @Inject(NOTE_READ_REPOSITORY) private readonly notes: NoteReadRepository
  ) {}

  /**
   * Ok when `ownerId` may hold one more active note: a registered or unknown owner always may, an
   * anonymous one only while owning fewer than `ANONYMOUS_LIMITS.maxNotes`. Reads the account rather
   * than trusting a caller's claim, so every path that adds a note applies the same rule.
   */
  async admit(ownerId: UserId): Promise<Result<void, NoteDomainError>> {
    const owner = await this.users.findById(ownerId.value);
    if (!owner?.isAnonymous) {
      return ok(undefined);
    }
    const { owned } = await this.notes.countAccessibleByUser(ownerId);
    return owned >= ANONYMOUS_LIMITS.maxNotes
      ? err(NoteErrors.anonymousNoteLimit(ANONYMOUS_LIMITS.maxNotes))
      : ok(undefined);
  }
}
