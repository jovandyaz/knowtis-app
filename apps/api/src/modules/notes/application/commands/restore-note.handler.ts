import { Inject, Injectable } from '@nestjs/common';
import type { Result } from 'neverthrow';

import {
  NOTE_REPOSITORY,
  type NoteDomainError,
  type NoteEntity,
  type NoteRepository,
} from '../../domain';

export interface RestoreNoteInput {
  readonly noteId: string;
  readonly userId: string;
}

@Injectable()
export class RestoreNoteHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}

  execute(
    input: RestoreNoteInput
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    return this.noteRepository.restore(input.noteId, input.userId);
  }
}
