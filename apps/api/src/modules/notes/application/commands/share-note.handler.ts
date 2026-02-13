import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import { PERMISSION, type PermissionLevel } from '@knowtis/shared-types';

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
  readonly userId: string;
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

    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(userIdResult.error as NoteDomainError);
    }

    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    const isOwner = note.ownerId === input.userId;
    if (!isOwner) {
      if (!note.editorsCanShare) {
        return err(NoteErrors.ownerOnly('share note'));
      }

      const callerPermission = await this.noteRepository.findPermission(
        input.noteId,
        userIdResult.value
      );

      if (
        !callerPermission ||
        callerPermission.permission.value !== PERMISSION.EDITOR
      ) {
        return err(NoteErrors.permissionDenied());
      }
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
