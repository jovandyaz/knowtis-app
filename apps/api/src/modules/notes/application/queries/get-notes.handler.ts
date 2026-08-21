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
  readonly page: number;
  readonly limit: number;
  readonly search?: string;
  readonly bucket?: BucketFilter;
  readonly view?: NoteListView;
}

export type AccessibleNote = NoteView & {
  accessLevel: NoteAccessLevel;
};

export interface AccessibleNotesPage {
  readonly items: AccessibleNote[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

@Injectable()
export class GetNotesHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}

  async execute(
    input: GetNotesInput
  ): Promise<Result<AccessibleNotesPage, NoteDomainError>> {
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(userIdResult.error as NoteDomainError);
    }

    const filters: NoteListFilters = {
      ...(input.search ? { search: input.search } : {}),
      ...(input.bucket ? { bucket: input.bucket } : {}),
      ...(input.view && input.view !== 'all' ? { view: input.view } : {}),
    };

    const { items, total } = await this.noteRepository.findAccessibleByUser(
      userIdResult.value,
      { page: input.page, limit: input.limit },
      filters
    );

    return ok({
      items: items.map(({ note, permission }) => ({
        ...note,
        accessLevel: (note.ownerId === input.userId
          ? ACCESS.OWNER
          : (permission ?? ACCESS.VIEWER)) as NoteAccessLevel,
      })),
      total,
      page: input.page,
      limit: input.limit,
    });
  }
}
