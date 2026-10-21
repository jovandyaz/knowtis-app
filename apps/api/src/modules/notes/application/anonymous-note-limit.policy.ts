import type { UserId } from '@jovandyaz/auth/server';
import { Injectable } from '@nestjs/common';

import { ANONYMOUS_LIMITS } from '@knowtis/shared-types';

import { UsersService } from '../../users/users.service';
import type { NoteAdmission } from '../domain/ports/note-write.repository';

@Injectable()
export class AnonymousNoteLimitPolicy {
  constructor(private readonly users: UsersService) {}

  /**
   * The admission a write adding an active note for `ownerId` must enforce: an anonymous owner is capped at
   * `ANONYMOUS_LIMITS.maxNotes`, a registered or unknown one is not. Reads the account rather than trusting a
   * caller's claim, so every path that adds a note applies the same rule; the write checks the cap atomically.
   */
  async admissionFor(ownerId: UserId): Promise<NoteAdmission> {
    const owner = await this.users.findById(ownerId.value);
    return owner?.isAnonymous
      ? { anonymousNoteCap: ANONYMOUS_LIMITS.maxNotes }
      : {};
  }
}
