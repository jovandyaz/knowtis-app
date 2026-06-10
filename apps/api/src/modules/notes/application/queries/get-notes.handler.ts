import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { ACCESS, type NoteAccessLevel } from '@knowtis/shared-types';

import {
  NOTE_REPOSITORY,
  type NoteDomainError,
  type NoteRepository,
  type NoteView,
} from '../../domain';

export interface GetNotesInput {
  readonly userId: string;
  readonly search?: string;
}

export type AccessibleNote = NoteView & {
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
