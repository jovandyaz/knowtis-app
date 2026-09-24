import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { isStoredImageUrl } from '@knowtis/shared-util';

import { registrableHostOf } from '../../../../core/logging/registrable-host';
import {
  NOTE_REPOSITORY,
  PERMISSION_REPOSITORY,
  type NoteDomainError,
  type NoteRepository,
  type PermissionRepository,
} from '../../domain';
import {
  imageImportError,
  ImageImportErrorCodes,
  REMOTE_IMAGE_FETCHER,
  type ImageImportError,
  type ImageImportErrorCode,
  type RemoteImageFetcher,
} from '../../domain/ports/remote-image-fetcher.port';
import { authorizeNoteWrite } from '../authorize-note-write';
import { toNoteImageView, type NoteImageView } from '../note-image-view';
import { NoteImageStoreService } from '../services/note-image-store.service';

const IMAGE_IMPORT_REJECTED_EVENT = 'notes.image_import.rejected';
const IMPORTED_IMAGE_FILENAME = 'imported';

export interface ImportImageInput {
  readonly noteId: string;
  readonly userId: string;
  readonly url: string;
  /** Aborted when the caller no longer wants the image, which stops the fetch. */
  readonly signal: AbortSignal;
}

/**
 * The note's copy of an imported image. `id` is null when the URL was already
 * in the app's blob store, so nothing was stored.
 */
export interface ImportedImage extends Omit<NoteImageView, 'id'> {
  readonly id: string | null;
}

@Injectable()
export class ImportImageHandler {
  private readonly logger = new Logger(ImportImageHandler.name);

  constructor(
    @Inject(NOTE_REPOSITORY) private readonly noteRepository: NoteRepository,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepository: PermissionRepository,
    @Inject(REMOTE_IMAGE_FETCHER)
    private readonly remoteImageFetcher: RemoteImageFetcher,
    private readonly noteImageStore: NoteImageStoreService
  ) {}

  async execute(
    input: ImportImageInput
  ): Promise<Result<ImportedImage, NoteDomainError | ImageImportError>> {
    const access = await authorizeNoteWrite(
      this.noteRepository,
      this.permissionRepository,
      input.noteId,
      input.userId
    );
    if (access.isErr()) {
      return err(access.error);
    }

    if (isStoredImageUrl(input.url)) {
      return ok({ id: null, url: input.url, width: null, height: null });
    }

    const url = URL.parse(input.url);
    if (url === null) {
      return this.reject(input, ImageImportErrorCodes.FETCH_FAILED, null);
    }

    const fetched = await this.remoteImageFetcher.fetch(url, input.signal);
    if (fetched.isErr()) {
      return this.reject(input, fetched.error.code, url);
    }

    const row = await this.noteImageStore.store({
      noteId: input.noteId,
      userId: input.userId,
      filename: IMPORTED_IMAGE_FILENAME,
      data: fetched.value.data,
      mimeType: fetched.value.mimeType,
      width: null,
      height: null,
    });
    return ok(toNoteImageView(row));
  }

  private reject(
    input: ImportImageInput,
    code: ImageImportErrorCode,
    url: URL | null
  ): Result<never, ImageImportError> {
    this.logger.warn({
      event: IMAGE_IMPORT_REJECTED_EVENT,
      code,
      host: url === null ? null : registrableHostOf(url.hostname),
      noteId: input.noteId,
      userId: input.userId,
      clientDisconnected: input.signal.aborted,
    });
    return err(imageImportError(code));
  }
}
