import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, type Result } from 'neverthrow';

import {
  NOTE_WRITE_REPOSITORY,
  NoteContent,
  NoteErrors,
  NoteTitle,
  type NoteDomainError,
  type NoteEntity,
  type NoteWriteRepository,
} from '../../domain';
import { NoteCreatedEvent } from '../../domain/events';
import { htmlToYjsState } from '../../infrastructure/html-to-yjs';

export interface CreateNoteInput {
  readonly id?: string;
  readonly title: string;
  readonly content?: string;
  readonly ownerId: string;
}

@Injectable()
export class CreateNoteHandler {
  private readonly logger = new Logger(CreateNoteHandler.name);

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

    const data = {
      ...(input.id ? { id: input.id } : {}),
      title: titleResult.value.value,
      content: contentResult.value.value,
      ownerId: ownerIdResult.value,
    };

    let result: Result<NoteEntity, NoteDomainError>;

    if (input.content !== undefined) {
      let yjsState: Buffer;
      try {
        yjsState = htmlToYjsState(input.content);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown parser error';
        this.logger.warn(
          `Failed to generate yjsState for new note (id=${input.id ?? 'new'}, size=${input.content.length}B): ${message}`
        );
        return err(
          NoteErrors.invalidContent(
            `Cannot convert HTML to Yjs state: ${message}`
          )
        );
      }

      result = await this.noteRepository.createWithYjsState(data, yjsState);
    } else {
      result = await this.noteRepository.create(data);
    }

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
