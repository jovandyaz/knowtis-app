import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import {
  NOTE_REPOSITORY,
  NoteErrors,
  type NoteDomainError,
  type NoteRepository,
} from '../../domain';
import {
  IMAGE_STORAGE,
  type ImageStorage,
} from '../../domain/ports/image-storage.port';
import {
  NOTE_IMAGE_REPOSITORY,
  type NoteImageRepository,
} from '../../domain/ports/note-image.repository';

export interface DeleteNoteInput {
  readonly noteId: string;
  readonly userId: string;
}

@Injectable()
export class DeleteNoteHandler {
  private readonly logger = new Logger(DeleteNoteHandler.name);

  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    @Inject(NOTE_IMAGE_REPOSITORY)
    private readonly noteImageRepository: NoteImageRepository,
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorage
  ) {}

  async execute(
    input: DeleteNoteInput
  ): Promise<Result<boolean, NoteDomainError>> {
    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    if (note.ownerId !== input.userId) {
      return err(
        NoteErrors.permissionDenied('Only owner can delete this note')
      );
    }

    const pathnames = await this.noteImageRepository.findPathnamesByNote(
      input.noteId
    );
    try {
      await this.imageStorage.delete(pathnames);
    } catch (error) {
      this.logger.warn(
        `Failed to delete blobs for note ${input.noteId}; rows will still cascade`,
        error
      );
    }

    return this.noteRepository.delete(input.noteId);
  }
}
