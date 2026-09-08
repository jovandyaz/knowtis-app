import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, type Result } from 'neverthrow';

import type {
  NotePerson,
  ShareNoteInput as PersonInput,
} from '@knowtis/shared-types';

import {
  USER_READ_REPOSITORY,
  type UserReadRepository,
} from '../../../users/domain/ports/user-read.repository';
import { VerifiedIdentityPolicy } from '../../../users/verified-identity.policy';
import {
  isEligibleRecipient,
  isPermissionWidening,
} from '../../domain/access-policy';
import {
  NoteErrors,
  type NoteDomainError,
} from '../../domain/errors/note.errors';
import { NoteSharedEvent } from '../../domain/events/note-shared.event';
import { NOTE_REPOSITORY, type NoteRepository } from '../../domain/ports';
import { authorizePeople } from '../authorize-people';
import { emitAccessChanged } from '../emit-access-changed';

export interface ShareNoteInput extends PersonInput {
  readonly noteId: string;
  readonly userId: string;
}
@Injectable()
export class ShareNoteHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    private readonly verifiedIdentity: VerifiedIdentityPolicy,
    private readonly eventEmitter: EventEmitter2,
    @Inject(USER_READ_REPOSITORY)
    private readonly usersRepository: UserReadRepository
  ) {}
  async execute(
    input: ShareNoteInput
  ): Promise<Result<NotePerson, NoteDomainError>> {
    const access = await authorizePeople(
      this.noteRepository,
      input.noteId,
      input.userId
    );
    if (access.isErr()) {
      return err(access.error);
    }
    const target = await this.usersRepository.findByEmail(
      input.email.trim().toLowerCase()
    );
    if (!isEligibleRecipient(target, access.value.ownerId, input.userId)) {
      return err(NoteErrors.personNotAddable());
    }
    const targetId = UserId.create(target.id);
    if (targetId.isErr()) {
      return err(NoteErrors.personNotAddable());
    }
    const existing = await this.noteRepository.findPermission(
      input.noteId,
      targetId.value
    );
    const widening = isPermissionWidening(
      existing?.permission.value ?? null,
      input.permission
    );
    if (widening && !(await this.verifiedIdentity.isVerified(input.userId))) {
      return err(NoteErrors.verificationRequired());
    }
    const result = await this.noteRepository.upsertPermission({
      noteId: input.noteId,
      userId: targetId.value,
      permission: input.permission,
      allowAmplification: widening,
    });
    if (result.isErr()) {
      return err(result.error);
    }
    emitAccessChanged(this.eventEmitter, input.noteId);
    this.eventEmitter.emit(
      NoteSharedEvent.EVENT_NAME,
      new NoteSharedEvent(input.userId, 'collaborator', input.permission)
    );
    return result.map(() => ({
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        avatarUrl: target.avatarUrl,
      },
      permission: input.permission,
    }));
  }
}
