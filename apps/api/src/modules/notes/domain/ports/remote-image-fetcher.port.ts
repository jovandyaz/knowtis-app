import type { Result } from 'neverthrow';

import { NoteErrorCodes } from '../errors/note.errors';
import type { ImageMimeType } from '../image-type';

/** Every way an image import from a URL fails. The API answers 422, folding the network-level codes into `fetch_failed`. */
export const IMAGE_IMPORT_ERROR_CODES = [
  'blocked_address',
  'too_large',
  NoteErrorCodes.UNSUPPORTED_IMAGE_TYPE,
  'fetch_failed',
  'timeout',
] as const;

export type ImageImportErrorCode = (typeof IMAGE_IMPORT_ERROR_CODES)[number];

export interface ImageImportError {
  readonly code: ImageImportErrorCode;
  readonly message: string;
}

const IMAGE_IMPORT_ERROR_MESSAGES: Readonly<
  Record<ImageImportErrorCode, string>
> = {
  blocked_address:
    'The image URL points to an address the server does not fetch from',
  too_large: 'The image is larger than a note accepts',
  [NoteErrorCodes.UNSUPPORTED_IMAGE_TYPE]:
    'The URL does not serve a PNG, JPEG, GIF or WebP image',
  fetch_failed: 'The image could not be fetched',
  timeout: 'The image took too long to fetch',
};

/**
 * Builds the error for `code`. The message is fixed per code and never echoes the URL
 * or a resolved address, so a refusal cannot map the server's network for the caller.
 */
export function imageImportError(code: ImageImportErrorCode): ImageImportError {
  return { code, message: IMAGE_IMPORT_ERROR_MESSAGES[code] };
}

export interface FetchedImage {
  readonly data: Buffer;
  readonly mimeType: ImageMimeType;
}

export interface RemoteImageFetcher {
  /** Downloads the image at `url`, typed by its bytes. Aborting `signal` ends it with `timeout`. */
  fetch(
    url: URL,
    signal: AbortSignal
  ): Promise<Result<FetchedImage, ImageImportError>>;
}

export const REMOTE_IMAGE_FETCHER = Symbol('REMOTE_IMAGE_FETCHER');
