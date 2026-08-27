import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { NoteErrorCodes } from './domain';
import { NOTE_ERROR_STATUS_MAP } from './notes.constants';

describe('NOTE_ERROR_STATUS_MAP', () => {
  it('answers an unverified caller with 403, like any other denial', () => {
    expect(NOTE_ERROR_STATUS_MAP[NoteErrorCodes.EMAIL_NOT_VERIFIED]).toBe(
      HttpStatus.FORBIDDEN
    );
    expect(NOTE_ERROR_STATUS_MAP[NoteErrorCodes.PERMISSION_DENIED]).toBe(
      HttpStatus.FORBIDDEN
    );
  });
});
