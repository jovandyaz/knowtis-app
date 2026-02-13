import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import type { PermissionLevel } from '@knowtis/shared-types';

import {
  NOTE_READ_REPOSITORY,
  NoteErrors,
  SHARE_LINK_REPOSITORY,
  ShareToken,
  type NoteDomainError,
  type NoteReadRepository,
  type ShareLinkEntity,
  type ShareLinkRepository,
} from '../../domain';

export interface CreateShareLinkInput {
  readonly noteId: string;
  readonly userId: string;
  readonly permission: PermissionLevel;
  readonly expiresAt?: Date;
}

@Injectable()
export class CreateShareLinkHandler {
  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReadRepo: NoteReadRepository,
    @Inject(SHARE_LINK_REPOSITORY)
    private readonly shareLinkRepo: ShareLinkRepository
  ) {}

  async execute(
    input: CreateShareLinkInput
  ): Promise<Result<ShareLinkEntity, NoteDomainError>> {
    const note = await this.noteReadRepo.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (note.ownerId !== input.userId) {
      return err(NoteErrors.ownerOnly('create share link'));
    }

    const tokenResult = ShareToken.generate();
    if (tokenResult.isErr()) {
      return err(tokenResult.error);
    }

    return this.shareLinkRepo.create({
      noteId: input.noteId,
      token: tokenResult.value.toPrimitive(),
      permission: input.permission,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.userId,
    });
  }
}
