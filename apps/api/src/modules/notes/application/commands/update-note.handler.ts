import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, type Result } from 'neverthrow';

import { GENERAL_ACCESS } from '@knowtis/shared-types';
import { pickDefined } from '@knowtis/shared-util';

import { UserId } from '../../../auth/domain';
import {
  NOTE_REPOSITORY,
  NoteContent,
  NoteErrors,
  NoteTitle,
  type NoteDomainError,
  type NoteEntity,
  type NoteRepository,
} from '../../domain';
import { NoteUpdatedEvent } from '../../domain/events';

export interface UpdateNoteInput {
  readonly noteId: string;
  readonly userId: string;
  readonly title?: string;
  readonly content?: string;
  readonly generalAccess?: string;
  readonly generalAccessPermission?: string;
  readonly editorsCanShare?: boolean;
}

const CONTENT_FIELDS = ['title', 'content'] as const;
const SHARING_FIELDS = [
  'generalAccess',
  'generalAccessPermission',
  'editorsCanShare',
] as const;

@Injectable()
export class UpdateNoteHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: UpdateNoteInput
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    const userIdResult = UserId.create(input.userId);
    if (userIdResult.isErr()) {
      return err(userIdResult.error as NoteDomainError);
    }

    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    const validationError = this.validateFields(input);
    if (validationError) {
      return validationError;
    }

    const isOwner = note.ownerId === input.userId;
    const result = isOwner
      ? await this.executeOwnerUpdate(input, note)
      : await this.executeEditorUpdate(input, userIdResult.value);

    if (result.isOk()) {
      this.emitUpdateEvent(input, note.id);
    }

    return result;
  }

  private validateFields(
    input: UpdateNoteInput
  ): Result<never, NoteDomainError> | null {
    if (input.title !== undefined) {
      const titleRes = NoteTitle.create(input.title);
      if (titleRes.isErr()) {
        return err(titleRes.error);
      }
    }

    if (input.content !== undefined) {
      const contentRes = NoteContent.create(input.content);
      if (contentRes.isErr()) {
        return err(contentRes.error);
      }
    }

    return null;
  }

  private async executeOwnerUpdate(
    input: UpdateNoteInput,
    note: NoteEntity
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    const updateData = {
      ...pickDefined(input, [...CONTENT_FIELDS, ...SHARING_FIELDS]),
      ...this.resolveShareToken(input, note),
    };

    return this.noteRepository.update(input.noteId, updateData);
  }

  private async executeEditorUpdate(
    input: UpdateNoteInput,
    userId: UserId
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    const canEdit = await this.noteRepository.hasAccess(
      input.noteId,
      userId,
      'editor'
    );
    if (!canEdit) {
      return err(NoteErrors.editPermissionDenied());
    }

    const hasSharingFields = SHARING_FIELDS.some(
      (field) => input[field] !== undefined
    );
    if (hasSharingFields) {
      return err(NoteErrors.ownerOnly('change sharing settings'));
    }

    return this.noteRepository.update(
      input.noteId,
      pickDefined(input, [...CONTENT_FIELDS])
    );
  }

  private resolveShareToken(
    input: UpdateNoteInput,
    note: NoteEntity
  ): { shareToken?: string | null } {
    if (input.generalAccess === undefined) {
      return {};
    }

    if (
      input.generalAccess === GENERAL_ACCESS.ANYONE_WITH_LINK &&
      !note.shareToken
    ) {
      return { shareToken: randomBytes(16).toString('hex') };
    }

    if (input.generalAccess === GENERAL_ACCESS.RESTRICTED) {
      return { shareToken: null };
    }

    return {};
  }

  private emitUpdateEvent(input: UpdateNoteInput, noteId: string): void {
    const updates = pickDefined(input, [...CONTENT_FIELDS, ...SHARING_FIELDS]);

    if (Object.keys(updates).length > 0) {
      this.eventEmitter.emit(
        NoteUpdatedEvent.EVENT_NAME,
        new NoteUpdatedEvent(noteId, updates, input.userId)
      );
    }
  }
}
