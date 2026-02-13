import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import type { NoteAccessLevel } from '@knowtis/shared-types';

import {
  NOTE_READ_REPOSITORY,
  NoteErrors,
  SHARE_LINK_REPOSITORY,
  type NoteDomainError,
  type NoteEntityWithOwner,
  type NoteReadRepository,
  type ShareLinkRepository,
} from '../../domain';

export type NoteByTokenResult = NoteEntityWithOwner & {
  readonly accessLevel: NoteAccessLevel;
};

@Injectable()
export class GetNoteByTokenHandler {
  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReadRepo: NoteReadRepository,
    @Inject(SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: ShareLinkRepository
  ) {}

  async execute(
    token: string
  ): Promise<Result<NoteByTokenResult, NoteDomainError>> {
    const shareLink = await this.shareLinkRepo.findByToken(token);
    if (!shareLink) {
      return err(NoteErrors.shareLinkNotFound(token));
    }

    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      return err(NoteErrors.shareLinkExpired());
    }

    const note = await this.noteReadRepo.findByIdWithOwner(shareLink.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(shareLink.noteId));
    }

    return ok({
      ...note,
      accessLevel: shareLink.permission.value,
    });
  }
}
