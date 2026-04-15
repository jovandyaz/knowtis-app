import { randomBytes } from 'node:crypto';

import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  GENERAL_ACCESS,
  type GeneralAccessLevel,
  type PermissionLevel,
} from '@knowtis/shared-types';
import { pickDefined } from '@knowtis/shared-util';

import {
  NOTE_REPOSITORY,
  NoteContent,
  NoteErrors,
  NoteTitle,
  type NoteDomainError,
  type NoteEntity,
  type NoteRepository,
  type UpdateNoteData,
} from '../../domain';
import {
  NoteUpdatedEvent,
  type NoteUpdatedEventUpdates,
} from '../../domain/events';
import { htmlToYjsState } from '../../infrastructure/html-to-yjs';

export interface UpdateNoteInput {
  readonly noteId: string;
  readonly userId: string;
  readonly title?: string;
  readonly content?: string;
  readonly generalAccess?: GeneralAccessLevel;
  readonly generalAccessPermission?: PermissionLevel;
  readonly editorsCanShare?: boolean;
}

interface PersistUpdateResult {
  readonly entity: NoteEntity;
  readonly yjsState?: Buffer;
}

const CONTENT_FIELDS = ['title', 'content'] as const;
const SHARING_FIELDS = [
  'generalAccess',
  'generalAccessPermission',
  'editorsCanShare',
] as const;

@Injectable()
export class UpdateNoteHandler {
  private readonly logger = new Logger(UpdateNoteHandler.name);

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
    const persisted = isOwner
      ? await this.executeOwnerUpdate(input, note)
      : await this.executeEditorUpdate(input, userIdResult.value);

    if (persisted.isOk()) {
      this.emitUpdateEvent(input, note.id, persisted.value.yjsState);
    }

    return persisted.map(({ entity }) => entity);
  }

  private async executeOwnerUpdate(
    input: UpdateNoteInput,
    note: NoteEntity
  ): Promise<Result<PersistUpdateResult, NoteDomainError>> {
    const updateData: UpdateNoteData = {
      ...pickDefined(input, [...CONTENT_FIELDS, ...SHARING_FIELDS]),
      ...this.resolveShareToken(input, note),
    };

    return this.persistUpdate(input.noteId, updateData, input.content);
  }

  private async executeEditorUpdate(
    input: UpdateNoteInput,
    userId: UserId
  ): Promise<Result<PersistUpdateResult, NoteDomainError>> {
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

    return this.persistUpdate(
      input.noteId,
      pickDefined(input, [...CONTENT_FIELDS]),
      input.content
    );
  }

  private async persistUpdate(
    noteId: string,
    updateData: UpdateNoteData,
    content: string | undefined
  ): Promise<Result<PersistUpdateResult, NoteDomainError>> {
    if (content === undefined) {
      const result = await this.noteRepository.update(noteId, updateData);
      return result.map((entity) => ({ entity }));
    }

    const yjsResult = this.generateYjsState(noteId, content);
    if (yjsResult.isErr()) {
      return err(yjsResult.error);
    }

    const yjsState = yjsResult.value;
    const result = await this.noteRepository.updateContentWithYjsState(
      noteId,
      { ...updateData, content },
      yjsState
    );
    return result.map((entity) => ({ entity, yjsState }));
  }

  private generateYjsState(
    noteId: string,
    content: string
  ): Result<Buffer, NoteDomainError> {
    try {
      return ok(htmlToYjsState(content));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown parser error';
      this.logger.warn(
        `Failed to generate yjsState for note ${noteId}: ${message}`
      );
      return err(
        NoteErrors.invalidContent(
          `Cannot convert HTML to Yjs state: ${message}`
        )
      );
    }
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

  private emitUpdateEvent(
    input: UpdateNoteInput,
    noteId: string,
    yjsState: Buffer | undefined
  ): void {
    const updates = pickDefined(input, [
      ...CONTENT_FIELDS,
      ...SHARING_FIELDS,
    ]) as NoteUpdatedEventUpdates;

    if (Object.keys(updates).length > 0) {
      this.eventEmitter.emit(
        NoteUpdatedEvent.EVENT_NAME,
        new NoteUpdatedEvent(noteId, updates, input.userId, yjsState)
      );
    }
  }
}
