import { HttpStatus } from '@nestjs/common';

import { NoteErrorCodes } from './domain';
import {
  ImageImportErrorCodes,
  type ImageImportErrorCode,
} from './domain/ports/remote-image-fetcher.port';

export const NOTE_UPDATE_THROTTLE = {
  default: { limit: 30, ttl: 60_000 },
} as const;

export const IMAGE_IMPORT_THROTTLE = {
  default: { limit: 20, ttl: 60_000 },
} as const;

type ClientImageImportErrorCode =
  | typeof ImageImportErrorCodes.TOO_LARGE
  | typeof ImageImportErrorCodes.UNSUPPORTED_TYPE
  | typeof ImageImportErrorCodes.FETCH_FAILED;

// OWASP SSRF prevention: an answer that told a blocked address from an
// unreachable or slow host would let refusals map the server's network, so
// those fold into one code. The rejection log keeps the precise one.
export const CLIENT_IMAGE_IMPORT_ERROR_CODE: Readonly<
  Record<ImageImportErrorCode, ClientImageImportErrorCode>
> = {
  [ImageImportErrorCodes.BLOCKED_ADDRESS]: ImageImportErrorCodes.FETCH_FAILED,
  [ImageImportErrorCodes.FETCH_FAILED]: ImageImportErrorCodes.FETCH_FAILED,
  [ImageImportErrorCodes.TIMEOUT]: ImageImportErrorCodes.FETCH_FAILED,
  [ImageImportErrorCodes.TOO_LARGE]: ImageImportErrorCodes.TOO_LARGE,
  [ImageImportErrorCodes.UNSUPPORTED_TYPE]:
    ImageImportErrorCodes.UNSUPPORTED_TYPE,
};

export const NOTE_ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [NoteErrorCodes.SHARE_LINK_CONFLICT]: HttpStatus.CONFLICT,
  [NoteErrorCodes.PERSON_NOT_ADDABLE]: HttpStatus.UNPROCESSABLE_ENTITY,
  [NoteErrorCodes.INVALID_TITLE]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_CONTENT]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_PERMISSION]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_TAG]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_SUPERTAG]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.NOTE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [NoteErrorCodes.TAG_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [NoteErrorCodes.TAG_CONFLICT]: HttpStatus.CONFLICT,
  [NoteErrorCodes.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [NoteErrorCodes.EMAIL_NOT_VERIFIED]: HttpStatus.FORBIDDEN,
  [NoteErrorCodes.SHARE_TOKEN_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [NoteErrorCodes.CONTENT_OVERWRITE_REFUSED]: HttpStatus.CONFLICT,
  [NoteErrorCodes.UNSUPPORTED_IMAGE_TYPE]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ImageImportErrorCodes.TOO_LARGE]: HttpStatus.UNPROCESSABLE_ENTITY,
  [ImageImportErrorCodes.FETCH_FAILED]: HttpStatus.UNPROCESSABLE_ENTITY,
  [NoteErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};
