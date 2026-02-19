import { UserId } from '@jovandyaz/auth';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  ACCESS,
  GENERAL_ACCESS,
  type NoteAccessLevel,
} from '@knowtis/shared-types';

import {
  NOTE_REPOSITORY,
  NoteErrors,
  type NoteDomainError,
  type NoteEntity,
  type NoteRepository,
} from '../../domain';

export interface GetNoteInput {
  readonly noteId: string;
  readonly userId: string;
}

export type NoteWithAccess = NoteEntity & {
  accessLevel: NoteAccessLevel;
};

@Injectable()
export class GetNoteHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}

  async execute(
    input: GetNoteInput
  ): Promise<Result<NoteWithAccess, NoteDomainError>> {
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(userIdResult.error as NoteDomainError);
    }

    const note = await this.noteRepository.findByIdWithOwner(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (note.ownerId === input.userId) {
      return ok({ ...note, accessLevel: ACCESS.OWNER });
    }

    const permission = await this.noteRepository.findPermission(
      input.noteId,
      userIdResult.value
    );

    if (note.generalAccess === GENERAL_ACCESS.ANYONE_WITH_LINK || permission) {
      const accessLevel: NoteAccessLevel = permission
        ? permission.permission.value
        : ACCESS.VIEWER;
      return ok({ ...note, accessLevel });
    }

    return err(NoteErrors.permissionDenied());
  }
}
