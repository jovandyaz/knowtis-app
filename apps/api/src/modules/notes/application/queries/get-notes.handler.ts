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
  TAG_REPOSITORY,
  type NoteDomainError,
  type NoteListFilters,
  type NoteRepository,
  type NoteView,
  type TagRepository,
} from '../../domain';

export interface GetNotesInput {
  readonly userId: string;
  readonly page: number;
  readonly limit: number;
  readonly search?: string;
  readonly bucket?: BucketFilter;
  readonly view?: NoteListView;
  readonly tag?: string;
}

export type AccessibleNote = NoteView & {
  accessLevel: NoteAccessLevel;
  tags: string[];
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
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    @Inject(TAG_REPOSITORY) private readonly tagRepository: TagRepository
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
      ...(input.tag ? { tag: input.tag } : {}),
    };

    const { items, total } = await this.noteRepository.findAccessibleByUser(
      userIdResult.value,
      { page: input.page, limit: input.limit },
      filters
    );

    // One query for the whole page: a lookup per note would be an N+1.
    const tagsByNote = await this.tagRepository.findPathsByNotes(
      items.map(({ note }) => note.id)
    );

    return ok({
      items: items.map(({ note, permission }) => ({
        ...note,
        accessLevel: (note.ownerId === input.userId
          ? ACCESS.OWNER
          : (permission ?? ACCESS.VIEWER)) as NoteAccessLevel,
        tags: tagsByNote.get(note.id) ?? [],
      })),
      total,
      page: input.page,
      limit: input.limit,
    });
  }
}
