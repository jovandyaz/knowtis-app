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
import { sniffImageType } from '../../domain/image-type';
import { NoteImageStoreService } from '../services/note-image-store.service';

export interface UploadImageInput {
  readonly noteId: string;
  readonly userId: string;
  readonly filename: string;
  readonly data: Buffer;
  readonly width?: number;
  readonly height?: number;
}

@Injectable()
export class UploadImageHandler {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepository: PermissionRepository,
    private readonly noteImageStore: NoteImageStoreService
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

    const mimeType = sniffImageType(input.data);
    if (!mimeType) {
      return err(NoteErrors.unsupportedImageType());
    }

    const row = await this.noteImageStore.store({
      noteId: input.noteId,
      userId: input.userId,
      filename: input.filename,
      data: input.data,
      mimeType,
      width: input.width ?? null,
      height: input.height ?? null,
    });
    return ok(row);
  }
}
