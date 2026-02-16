import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import { UserId } from '../../../auth/domain/value-objects/user-id.vo';
import {
  NOTE_REPOSITORY,
  NoteErrors,
  type NoteDomainError,
  type NoteRepository,
} from '../../domain';

export interface RevokeAccessInput {
  readonly noteId: string;
  readonly ownerId: string;
  readonly targetUserId: string;
}

@Injectable()
export class RevokeAccessHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository
  ) {}

  async execute(
    input: RevokeAccessInput
  ): Promise<Result<boolean, NoteDomainError>> {
    const targetUserIdResult = UserId.create(input.targetUserId);
    if (targetUserIdResult.isErr()) {
      return err(targetUserIdResult.error as NoteDomainError);
    }

    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (note.ownerId !== input.ownerId) {
      return err(NoteErrors.permissionDenied('Only owner can revoke access'));
    }

    return this.noteRepository.deletePermission(
      input.noteId,
      targetUserIdResult.value
    );
  }
}
