import { Inject, Injectable, Logger } from '@nestjs/common';

import { reasonOf } from '../../../../core/errors/reason-of';
import type { NoteImage } from '../../../../database/schema';
import type { ImageMimeType } from '../../domain/image-type';
import {
  IMAGE_STORAGE,
  type ImageStorage,
} from '../../domain/ports/image-storage.port';
import {
  NOTE_IMAGE_REPOSITORY,
  type NoteImageRepository,
} from '../../domain/ports/note-image.repository';

export interface StoreNoteImageInput {
  readonly noteId: string;
  readonly userId: string;
  readonly filename: string;
  readonly data: Buffer;
  readonly mimeType: ImageMimeType;
  readonly width: number | null;
  readonly height: number | null;
}

@Injectable()
export class NoteImageStoreService {
  private readonly logger = new Logger(NoteImageStoreService.name);

  constructor(
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorage,
    @Inject(NOTE_IMAGE_REPOSITORY)
    private readonly noteImageRepository: NoteImageRepository
  ) {}

  /**
   * Uploads image bytes whose type the caller already verified, and records them in `note_images`.
   * Callers own the note and access checks.
   */
  async store(input: StoreNoteImageInput): Promise<NoteImage> {
    const uploaded = await this.imageStorage.upload({
      noteId: input.noteId,
      filename: input.filename,
      data: input.data,
      contentType: input.mimeType,
    });

    try {
      return await this.noteImageRepository.create({
        noteId: input.noteId,
        userId: input.userId,
        pathname: uploaded.pathname,
        url: uploaded.url,
        size: input.data.byteLength,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
      });
    } catch (error) {
      // Cleanup-on-delete only knows blobs tracked in note_images, so an
      // untracked blob would be orphaned forever.
      await this.imageStorage
        .delete([uploaded.pathname])
        .catch((deleteError: unknown) => {
          this.logger.warn(
            `Could not delete blob ${uploaded.pathname} of note ${input.noteId} after its note_images insert failed: ${reasonOf(deleteError)}`
          );
        });
      throw error;
    }
  }
}
