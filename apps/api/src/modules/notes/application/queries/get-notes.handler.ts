import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  ACCESS,
  type BucketFilter,
  type NoteAccessLevel,
  type NoteListView,
} from '@knowtis/shared-types';

import {
  NOTE_REPOSITORY,
  type NoteDomainError,
  type NoteListFilters,
  type NoteRepository,
  type NoteView,
} from '../../domain';

export interface GetNotesInput {
  readonly userId: string;
  readonly search?: string;
  readonly bucket?: BucketFilter;
  readonly view?: NoteListView;
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

    const filters: NoteListFilters = {
      ...(input.search ? { search: input.search } : {}),
      ...(input.bucket ? { bucket: input.bucket } : {}),
    };

    const results = await this.noteRepository.findAccessibleByUser(
      userIdResult.value,
      filters
    );

    const accessibleNotes: AccessibleNote[] = results.map(
      ({ note, permission }) => ({
        ...note,
        accessLevel: (note.ownerId === input.userId
          ? ACCESS.OWNER
          : (permission ?? ACCESS.VIEWER)) as NoteAccessLevel,
      })
    );

    const view = input.view ?? 'all';
    const filtered =
      view === 'all'
        ? accessibleNotes
        : accessibleNotes.filter((note) =>
            view === 'mine'
              ? note.accessLevel === ACCESS.OWNER
              : note.accessLevel !== ACCESS.OWNER
          );

    return ok(filtered);
  }
}
