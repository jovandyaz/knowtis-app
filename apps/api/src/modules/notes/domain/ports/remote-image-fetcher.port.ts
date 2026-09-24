import type { Result } from 'neverthrow';

import type { ImageMimeType } from '@knowtis/shared-util';

import { NoteErrorCodes } from '../errors/note.errors';

export const ImageImportErrorCodes = {
  BLOCKED_ADDRESS: 'blocked_address',
  TOO_LARGE: 'too_large',
  UNSUPPORTED_TYPE: NoteErrorCodes.UNSUPPORTED_IMAGE_TYPE,
  FETCH_FAILED: 'fetch_failed',
  TIMEOUT: 'timeout',
} as const;

/** Every way an image import from a URL fails. The API answers 422, folding the network-level codes into `fetch_failed`. */
export const IMAGE_IMPORT_ERROR_CODES = [
  ImageImportErrorCodes.BLOCKED_ADDRESS,
  ImageImportErrorCodes.TOO_LARGE,
  ImageImportErrorCodes.UNSUPPORTED_TYPE,
  ImageImportErrorCodes.FETCH_FAILED,
  ImageImportErrorCodes.TIMEOUT,
] as const;

export type ImageImportErrorCode = (typeof IMAGE_IMPORT_ERROR_CODES)[number];

export interface ImageImportError {
  readonly code: ImageImportErrorCode;
  readonly message: string;
}

const IMAGE_IMPORT_ERROR_MESSAGES: Readonly<
  Record<ImageImportErrorCode, string>
> = {
  [ImageImportErrorCodes.BLOCKED_ADDRESS]:
    'The image URL points to an address the server does not fetch from',
  [ImageImportErrorCodes.TOO_LARGE]: 'The image is larger than a note accepts',
  [ImageImportErrorCodes.UNSUPPORTED_TYPE]:
    'The URL does not serve a PNG, JPEG, GIF or WebP image',
  [ImageImportErrorCodes.FETCH_FAILED]: 'The image could not be fetched',
  [ImageImportErrorCodes.TIMEOUT]: 'The image took too long to fetch',
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
