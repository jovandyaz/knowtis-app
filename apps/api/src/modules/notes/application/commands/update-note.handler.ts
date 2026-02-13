import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, type Result } from 'neverthrow';

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
  readonly isPublic?: boolean;
}

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

    let result: Result<NoteEntity, NoteDomainError>;

    if (note.ownerId === input.userId) {
      result = await this.noteRepository.update(input.noteId, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      });
    } else {
      const canEdit = await this.noteRepository.hasAccess(
        input.noteId,
        userIdResult.value,
        'editor'
      );
      if (!canEdit) {
        return err(NoteErrors.editPermissionDenied());
      }

      if (input.isPublic !== undefined) {
        return err(NoteErrors.ownerOnly('change public status'));
      }

      result = await this.noteRepository.update(input.noteId, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
      });
    }

    if (result.isOk()) {
      const updates: {
        title?: string;
        content?: string;
        isPublic?: boolean;
      } = {};
      if (input.title !== undefined) {
        updates.title = input.title;
      }
      if (input.content !== undefined) {
        updates.content = input.content;
      }
      if (input.isPublic !== undefined) {
        updates.isPublic = input.isPublic;
      }

      if (Object.keys(updates).length > 0) {
        this.eventEmitter.emit(
          NoteUpdatedEvent.EVENT_NAME,
          new NoteUpdatedEvent(note.id, updates, input.userId)
        );
      }
    }

    return result;
  }
}
