import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  NoteErrors,
  TAG_REPOSITORY,
  TagPath,
  type NoteDomainError,
  type TagRepository,
} from '../../domain';

export interface UpdateTagInput {
  readonly tagId: string;
  readonly userId: string;
  readonly path?: string;
  readonly color?: string | null;
}

@Injectable()
export class UpdateTagHandler {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tagRepository: TagRepository
  ) {}

  async execute(input: UpdateTagInput): Promise<Result<void, NoteDomainError>> {
    const tag = await this.tagRepository.findById(input.tagId);
    if (!tag) {
      return err(NoteErrors.tagNotFound(input.tagId));
    }
    if (tag.ownerId !== input.userId) {
      return err(NoteErrors.ownerOnly('rename or recolor a tag'));
    }

    if (input.path !== undefined) {
      const pathResult = TagPath.create(input.path);
      if (pathResult.isErr()) {
        return err(pathResult.error);
      }
      await this.tagRepository.renameBranch(tag, pathResult.value);
    }

    if (input.color !== undefined) {
      await this.tagRepository.recolor(tag.id, input.color);
    }

    return ok(undefined);
  }
}
