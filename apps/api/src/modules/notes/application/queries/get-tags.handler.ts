import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import type { TagNode } from '@knowtis/shared-types';

import {
  TAG_REPOSITORY,
  type NoteDomainError,
  type TagRepository,
} from '../../domain';

export interface GetTagsInput {
  readonly userId: string;
}

@Injectable()
export class GetTagsHandler {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tagRepository: TagRepository
  ) {}

  async execute(
    input: GetTagsInput
  ): Promise<Result<TagNode[], NoteDomainError>> {
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(userIdResult.error as NoteDomainError);
    }
    return ok(await this.tagRepository.findTreeByOwner(userIdResult.value));
  }
}
