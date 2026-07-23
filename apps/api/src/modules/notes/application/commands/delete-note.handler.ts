import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import {
  NOTE_REPOSITORY,
  NoteErrors,
  type NoteDomainError,
  type NoteRepository,
} from '../../domain';

export interface DeleteNoteInput {
  readonly noteId: string;
  readonly userId: string;
}

@Injectable()
export class DeleteNoteHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}

  async execute(
    input: DeleteNoteInput
  ): Promise<Result<boolean, NoteDomainError>> {
    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (note.ownerId !== input.userId) {
      return err(
        NoteErrors.permissionDenied('Only owner can delete this note')
      );
    }

    return this.noteRepository.delete(input.noteId);
  }
}
