import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import type { NoteBucketCounts } from '@knowtis/shared-types';

import {
  NOTE_REPOSITORY,
  type NoteDomainError,
  type NoteRepository,
} from '../../domain';

export interface GetNoteCountsInput {
  readonly userId: string;
}

@Injectable()
export class GetNoteCountsHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}

  async execute(
    input: GetNoteCountsInput
  ): Promise<Result<NoteBucketCounts, NoteDomainError>> {
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(userIdResult.error as NoteDomainError);
    }
    return ok(
      await this.noteRepository.countAccessibleByBucket(userIdResult.value)
    );
  }
}
