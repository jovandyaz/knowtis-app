import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import type { Result } from 'neverthrow';

import {
  NOTE_REPOSITORY,
  type NoteDomainError,
  type NoteEntity,
  type NoteRepository,
} from '../../domain';
import { AnonymousNoteLimitPolicy } from '../anonymous-note-limit.policy';

export interface RestoreNoteInput {
  readonly noteId: string;
  readonly userId: string;
}

@Injectable()
export class RestoreNoteHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    private readonly noteLimit: AnonymousNoteLimitPolicy
  ) {}

  async execute(
    input: RestoreNoteInput
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    const admission = await this.noteLimit.admissionFor(
      UserId.fromTrusted(input.userId)
    );
    return this.noteRepository.restore(input.noteId, input.userId, admission);
  }
}
