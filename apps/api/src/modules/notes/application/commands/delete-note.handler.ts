import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, type Result } from 'neverthrow';

import {
  NOTE_REPOSITORY,
  NoteErrors,
  type NoteDomainError,
  type NoteRepository,
} from '../../domain';
import { emitAccessChanged } from '../emit-access-changed';

export interface DeleteNoteInput {
  readonly noteId: string;
  readonly userId: string;
}

@Injectable()
export class DeleteNoteHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    private readonly eventEmitter: EventEmitter2
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

    const result = await this.noteRepository.delete(input.noteId);
    if (result.isOk()) {
      emitAccessChanged(this.eventEmitter, input.noteId);
    }
    return result;
  }
}
