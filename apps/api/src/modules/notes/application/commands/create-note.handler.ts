import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, type Result } from 'neverthrow';

import { UserId } from '../../../auth/domain/value-objects/user-id.vo';
import {
  NOTE_WRITE_REPOSITORY,
  NoteContent,
  NoteTitle,
  type NoteDomainError,
  type NoteEntity,
  type NoteWriteRepository,
} from '../../domain';
import { NoteCreatedEvent } from '../../domain/events';

export interface CreateNoteInput {
  readonly title: string;
  readonly content?: string;
  readonly ownerId: string;
}
@Injectable()
export class CreateNoteHandler {
  constructor(
    @Inject(NOTE_WRITE_REPOSITORY)
    private readonly noteRepository: NoteWriteRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: CreateNoteInput
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    const titleResult = NoteTitle.create(input.title);
    if (titleResult.isErr()) {
      return err(titleResult.error);
    }

    const ownerIdResult = UserId.create(input.ownerId);
    if (ownerIdResult.isErr()) {
      return err(ownerIdResult.error as NoteDomainError);
    }

    const contentResult = NoteContent.create(input.content ?? '');
    if (contentResult.isErr()) {
      return err(contentResult.error);
    }

    const result = await this.noteRepository.create({
      title: titleResult.value.value,
      content: contentResult.value.value,
      ownerId: ownerIdResult.value,
    });

    if (result.isOk()) {
      const note = result.value;
      this.eventEmitter.emit(
        NoteCreatedEvent.EVENT_NAME,
        new NoteCreatedEvent(note.id, note.title, note.ownerId)
      );
    }

    return result;
  }
}
