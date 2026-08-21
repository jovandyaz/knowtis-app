import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  NoteErrors,
  TAG_REPOSITORY,
  type NoteDomainError,
  type TagRepository,
} from '../../domain';

export interface DeleteTagInput {
  readonly tagId: string;
  readonly userId: string;
}

@Injectable()
export class DeleteTagHandler {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tagRepository: TagRepository
  ) {}

  async execute(input: DeleteTagInput): Promise<Result<void, NoteDomainError>> {
    const tag = await this.tagRepository.findById(input.tagId);
    if (!tag) {
      return err(NoteErrors.tagNotFound(input.tagId));
    }
    if (tag.ownerId !== input.userId) {
      return err(NoteErrors.ownerOnly('delete a tag'));
    }

    await this.tagRepository.deleteBranch(tag);
    return ok(undefined);
  }
}
