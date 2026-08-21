import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import type {
  NoteBucketCounts,
  NoteSupertagCounts,
} from '@knowtis/shared-types';

import {
  NOTE_REPOSITORY,
  type NoteDomainError,
  type NoteRepository,
} from '../../domain';

export interface GetNoteCountsInput {
  readonly userId: string;
}

export type NoteCounts = NoteBucketCounts & {
  readonly supertags: NoteSupertagCounts;
};

@Injectable()
export class GetNoteCountsHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}

  async execute(
    input: GetNoteCountsInput
  ): Promise<Result<NoteCounts, NoteDomainError>> {
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(userIdResult.error as NoteDomainError);
    }

    const [buckets, supertags] = await Promise.all([
      this.noteRepository.countAccessibleByBucket(userIdResult.value),
      this.noteRepository.countAccessibleBySupertag(userIdResult.value),
    ]);

    return ok({ ...buckets, supertags });
  }
}
