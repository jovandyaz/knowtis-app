export interface AnonymousLimits {
  maxNotes: number;
}

export const ANONYMOUS_LIMITS: AnonymousLimits = {
  maxNotes: 5,
};

/** The error code of a note an anonymous user may not create or restore because they already hold `maxNotes`. */
export const ANONYMOUS_NOTE_LIMIT_CODE = 'ANONYMOUS_NOTE_LIMIT';
