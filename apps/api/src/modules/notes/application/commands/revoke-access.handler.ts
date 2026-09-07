import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import { canChangePerson } from '../../domain/access-policy';
import {
  NoteErrors,
  type NoteDomainError,
} from '../../domain/errors/note.errors';
import { NOTE_REPOSITORY, type NoteRepository } from '../../domain/ports';
import { authorizePeople } from '../authorize-people';

export interface RevokeAccessInput {
  readonly noteId: string;
  readonly userId: string;
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
    const access = await authorizePeople(
      this.noteRepository,
      input.noteId,
      input.userId
    );
    if (access.isErr()) {
      return err(access.error);
    }
    if (
      !canChangePerson(input.targetUserId, access.value.ownerId, input.userId)
    ) {
      return err(NoteErrors.personNotAddable());
    }
    const target = UserId.create(input.targetUserId);
    if (target.isErr()) {
      return err(NoteErrors.personNotAddable());
    }
    return this.noteRepository.deletePermission(input.noteId, target.value);
  }
}
