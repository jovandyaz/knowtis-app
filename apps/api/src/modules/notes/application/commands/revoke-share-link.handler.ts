import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import {
  NOTE_READ_REPOSITORY,
  NoteErrors,
  SHARE_LINK_REPOSITORY,
  type NoteDomainError,
  type NoteReadRepository,
  type ShareLinkRepository,
} from '../../domain';

export interface RevokeShareLinkInput {
  readonly noteId: string;
  readonly linkId: string;
  readonly userId: string;
}

@Injectable()
export class RevokeShareLinkHandler {
  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReadRepo: NoteReadRepository,
    @Inject(SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: ShareLinkRepository
  ) {}

  async execute(
    input: RevokeShareLinkInput
  ): Promise<Result<void, NoteDomainError>> {
    const note = await this.noteReadRepo.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (note.ownerId !== input.userId) {
      return err(NoteErrors.ownerOnly('revoke share link'));
    }

    return this.shareLinkRepo.delete(input.linkId);
  }
}
