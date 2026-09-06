import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { isWithinBranch, type TagColor } from '@knowtis/shared-types';

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
  readonly color?: TagColor | null;
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

      const nextPath = pathResult.value;

      if (nextPath.value !== tag.path) {
        // Moving a branch under itself leaves its own former path with no owner:
        // no rewrite makes it coherent, so it is malformed rather than blocked.
        if (isWithinBranch(nextPath.value, tag.path)) {
          return err(
            NoteErrors.invalidTag('a tag cannot be nested inside itself')
          );
        }

        // The owner/path unique index would surface a collision as a 500, and a
        // rename that merged two branches would be silent data loss either way.
        const collision = await this.tagRepository.findPathCollision(
          tag,
          nextPath
        );
        if (collision) {
          return err(NoteErrors.tagConflict(collision));
        }

        const renamed = await this.tagRepository.renameBranch(tag, nextPath);
        if (renamed.isErr()) {
          return err(renamed.error);
        }
      }
    }

    if (input.color !== undefined) {
      await this.tagRepository.recolor(tag.id, input.color);
    }

    return ok(undefined);
  }
}
