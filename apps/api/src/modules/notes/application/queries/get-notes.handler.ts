import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { ACCESS, type NoteAccessLevel } from '@knowtis/shared-types';

import { UserId } from '../../../auth/domain';
import {
  NOTE_REPOSITORY,
  type NoteDomainError,
  type NoteEntity,
  type NoteRepository,
} from '../../domain';

export interface GetNotesInput {
  readonly userId: string;
  readonly search?: string;
}

export type AccessibleNote = NoteEntity & {
  accessLevel: NoteAccessLevel;
};

@Injectable()
export class GetNotesHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}

  async execute(
    input: GetNotesInput
  ): Promise<Result<AccessibleNote[], NoteDomainError>> {
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(userIdResult.error as NoteDomainError);
    }

    const results = await this.noteRepository.findAccessibleByUser(
      userIdResult.value,
      input.search
    );

    const accessibleNotes: AccessibleNote[] = results.map(
      ({ note, permission }) => ({
        ...note,
        accessLevel: (note.ownerId === input.userId
          ? ACCESS.OWNER
          : (permission ?? ACCESS.VIEWER)) as NoteAccessLevel,
      })
    );

    return ok(accessibleNotes);
  }
}
