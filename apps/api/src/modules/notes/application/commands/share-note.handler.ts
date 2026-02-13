import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import type { PermissionLevel } from '@knowtis/shared-types';

import { UserId } from '../../../auth/domain';
import {
  NOTE_REPOSITORY,
  NoteErrors,
  type NoteDomainError,
  type NotePermissionEntity,
  type NoteRepository,
} from '../../domain';

export interface ShareNoteInput {
  readonly noteId: string;
  readonly ownerId: string;
  readonly targetUserId: string;
  readonly permission: PermissionLevel;
}

@Injectable()
export class ShareNoteHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}

  async execute(
    input: ShareNoteInput
  ): Promise<Result<NotePermissionEntity, NoteDomainError>> {
    const targetUserIdResult = UserId.create(input.targetUserId);
    if (targetUserIdResult.isErr()) {
      return err(targetUserIdResult.error as NoteDomainError);
    }

    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (note.ownerId !== input.ownerId) {
      return err(NoteErrors.ownerOnly('share note'));
    }

    const existing = await this.noteRepository.findPermission(
      input.noteId,
      targetUserIdResult.value
    );

    if (existing) {
      return this.noteRepository.updatePermission(
        input.noteId,
        targetUserIdResult.value,
        input.permission
      );
    }

    return this.noteRepository.createPermission({
      noteId: input.noteId,
      userId: targetUserIdResult.value,
      permission: input.permission,
    });
  }
}
