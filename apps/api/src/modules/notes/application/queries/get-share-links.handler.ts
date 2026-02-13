import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  NOTE_READ_REPOSITORY,
  NoteErrors,
  SHARE_LINK_REPOSITORY,
  type NoteDomainError,
  type NoteReadRepository,
  type ShareLinkEntity,
  type ShareLinkRepository,
} from '../../domain';

export interface GetShareLinksInput {
  readonly noteId: string;
  readonly userId: string;
}

@Injectable()
export class GetShareLinksHandler {
  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReadRepo: NoteReadRepository,
    @Inject(SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: ShareLinkRepository
  ) {}

  async execute(
    input: GetShareLinksInput
  ): Promise<Result<readonly ShareLinkEntity[], NoteDomainError>> {
    const note = await this.noteReadRepo.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (note.ownerId !== input.userId) {
      return err(NoteErrors.ownerOnly('view share links'));
    }

    const links = await this.shareLinkRepo.findByNoteId(input.noteId);
    return ok(links);
  }
}
