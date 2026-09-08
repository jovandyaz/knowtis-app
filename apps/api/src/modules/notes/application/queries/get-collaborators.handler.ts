import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import type { NotePerson } from '@knowtis/shared-types';

import type { NoteDomainError } from '../../domain/errors/note.errors';
import { NOTE_REPOSITORY, type NoteRepository } from '../../domain/ports';
import { authorizePeople } from '../authorize-people';

export interface GetCollaboratorsInput {
  readonly noteId: string;
  readonly userId: string;
}
@Injectable()
export class GetCollaboratorsHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}
  async execute(
    input: GetCollaboratorsInput
  ): Promise<Result<NotePerson[], NoteDomainError>> {
    const access = await authorizePeople(
      this.noteRepository,
      input.noteId,
      input.userId
    );
    if (access.isErr()) {
      return err(access.error);
    }
    return ok(await this.noteRepository.findPeopleByNote(input.noteId));
  }
}
