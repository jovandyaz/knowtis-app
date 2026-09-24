import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  NoteErrors,
  type NoteDomainError,
} from '../../domain/errors/note.errors';
import { sniffImageType } from '../../domain/image-type';
import { NOTE_REPOSITORY, type NoteRepository } from '../../domain/ports';
import {
  PERMISSION_REPOSITORY,
  type PermissionRepository,
} from '../../domain/ports/permission.repository';
import { authorizeNoteWrite } from '../authorize-note-write';
import { toNoteImageView, type NoteImageView } from '../note-image-view';
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
  ): Promise<Result<NoteImageView, NoteDomainError>> {
    const access = await authorizeNoteWrite(
      this.noteRepository,
      this.permissionRepository,
      input.noteId,
      input.userId
    );
    if (access.isErr()) {
      return err(access.error);
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
    return ok(toNoteImageView(row));
  }
}
