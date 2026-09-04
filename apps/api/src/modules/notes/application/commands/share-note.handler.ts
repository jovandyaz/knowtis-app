import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, type Result } from 'neverthrow';

import { PERMISSION, type PermissionLevel } from '@knowtis/shared-types';

import { VerifiedIdentityPolicy } from '../../../users/verified-identity.policy';
import {
  NOTE_REPOSITORY,
  NoteErrors,
  type NoteDomainError,
  type NotePermissionEntity,
  type NoteRepository,
} from '../../domain';
import { NoteSharedEvent } from '../../domain/events';

export interface ShareNoteInput {
  readonly noteId: string;
  readonly userId: string;
  readonly targetUserId: string;
  readonly permission: PermissionLevel;
}

@Injectable()
export class ShareNoteHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    private readonly verifiedIdentity: VerifiedIdentityPolicy,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: ShareNoteInput
  ): Promise<Result<NotePermissionEntity, NoteDomainError>> {
    if (!(await this.verifiedIdentity.isVerified(input.userId))) {
      return err(NoteErrors.verificationRequired());
    }

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

    const result = await this.noteRepository.upsertPermission({
      noteId: input.noteId,
      userId: targetUserIdResult.value,
      permission: input.permission,
    });

    if (result.isOk()) {
      this.eventEmitter.emit(
        NoteSharedEvent.EVENT_NAME,
        new NoteSharedEvent(input.userId, 'collaborator', input.permission)
      );
    }

    return result;
  }
}
