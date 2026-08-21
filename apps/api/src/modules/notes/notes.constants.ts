import { HttpStatus } from '@nestjs/common';

import { NoteErrorCodes } from './domain';

export const NOTE_UPDATE_THROTTLE = {
  default: { limit: 30, ttl: 60_000 },
} as const;

export const NOTE_ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [NoteErrorCodes.INVALID_TITLE]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_CONTENT]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_PERMISSION]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_TAG]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_SUPERTAG]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.NOTE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [NoteErrorCodes.TAG_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [NoteErrorCodes.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [NoteErrorCodes.SHARE_TOKEN_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [NoteErrorCodes.CONTENT_OVERWRITE_REFUSED]: HttpStatus.CONFLICT,
  [NoteErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};
