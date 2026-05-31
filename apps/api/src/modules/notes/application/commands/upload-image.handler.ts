import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import type { NoteImage } from '../../../../database/schema';
import {
  NOTE_REPOSITORY,
  NoteErrors,
  PERMISSION_REPOSITORY,
  type NoteDomainError,
  type NoteRepository,
  type PermissionRepository,
} from '../../domain';
import {
  IMAGE_STORAGE,
  type ImageStorage,
} from '../../domain/ports/image-storage.port';
import {
  NOTE_IMAGE_REPOSITORY,
  type NoteImageRepository,
} from '../../domain/ports/note-image.repository';

export interface UploadImageInput {
  readonly noteId: string;
  readonly userId: string;
  readonly filename: string;
  readonly data: Buffer;
  readonly contentType: string;
  readonly size: number;
  readonly width?: number;
  readonly height?: number;
}

@Injectable()
export class UploadImageHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepository: PermissionRepository,
    @Inject(NOTE_IMAGE_REPOSITORY)
    private readonly noteImageRepository: NoteImageRepository,
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorage
  ) {}

  async execute(
    input: UploadImageInput
  ): Promise<Result<NoteImage, NoteDomainError>> {
    const note = await this.noteRepository.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }

    const userId = UserId.fromTrusted(input.userId);
    const canWrite =
      note.ownerId === input.userId ||
      (await this.permissionRepository.hasAccess(
        input.noteId,
        userId,
        'editor'
      ));
    if (!canWrite) {
      return err(NoteErrors.permissionDenied('No write access to this note'));
    }

    const uploaded = await this.imageStorage.upload({
      noteId: input.noteId,
      filename: input.filename,
      data: input.data,
      contentType: input.contentType,
    });

    try {
      const row = await this.noteImageRepository.create({
        noteId: input.noteId,
        userId: input.userId,
        pathname: uploaded.pathname,
        url: uploaded.url,
        size: input.size,
        mimeType: input.contentType,
        width: input.width ?? null,
        height: input.height ?? null,
      });
      return ok(row);
    } catch (error) {
      // Compensate: drop the just-uploaded blob so a failed insert doesn't
      // orphan it (cleanup-on-delete only knows blobs tracked in note_images).
      await this.imageStorage
        .delete([uploaded.pathname])
        .catch(() => undefined);
      throw error;
    }
  }
}
