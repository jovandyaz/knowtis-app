import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import type { NoteAccessLevel } from '@knowtis/shared-types';

import {
  NOTE_READ_REPOSITORY,
  NoteErrors,
  type NoteDomainError,
  type NoteEntityWithOwner,
  type NoteReadRepository,
} from '../../domain';

export type NoteByTokenResult = NoteEntityWithOwner & {
  readonly accessLevel: NoteAccessLevel;
};

@Injectable()
export class GetNoteByTokenHandler {
  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReadRepo: NoteReadRepository
  ) {}

  async execute(
    token: string
  ): Promise<Result<NoteByTokenResult, NoteDomainError>> {
    const note = await this.noteReadRepo.findByShareToken(token);
    if (!note) {
      return err(NoteErrors.shareTokenNotFound(token));
    }

    return ok({
      ...note,
      accessLevel: note.generalAccessPermission as NoteAccessLevel,
    });
  }
}
