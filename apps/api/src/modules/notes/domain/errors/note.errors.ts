export interface NoteDomainError {
  readonly code: string;
  readonly message: string;
}

export const NoteErrorCodes = {
  INVALID_TITLE: 'INVALID_TITLE',
  INVALID_CONTENT: 'INVALID_CONTENT',
  INVALID_PERMISSION: 'INVALID_PERMISSION',
  INVALID_TAG: 'INVALID_TAG',
  INVALID_SUPERTAG: 'INVALID_SUPERTAG',
  TAG_NOT_FOUND: 'TAG_NOT_FOUND',
  NOTE_NOT_FOUND: 'NOTE_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SHARE_TOKEN_NOT_FOUND: 'SHARE_TOKEN_NOT_FOUND',
  CONTENT_OVERWRITE_REFUSED: 'CONTENT_OVERWRITE_REFUSED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type NoteErrorCode =
  (typeof NoteErrorCodes)[keyof typeof NoteErrorCodes];

export function createNoteError(
  code: NoteErrorCode,
  message: string
): NoteDomainError {
  return { code, message };
}

export const NoteErrors = {
  invalidTitle: (reason: string) =>
    createNoteError(NoteErrorCodes.INVALID_TITLE, `Invalid title: ${reason}`),

  invalidContent: (reason: string) =>
    createNoteError(
      NoteErrorCodes.INVALID_CONTENT,
      `Invalid content: ${reason}`
    ),

  invalidPermission: () =>
    createNoteError(
      NoteErrorCodes.INVALID_PERMISSION,
      'Invalid permission level'
    ),

  invalidTag: (reason: string) =>
    createNoteError(NoteErrorCodes.INVALID_TAG, `Invalid tag: ${reason}`),

  invalidSupertag: (reason: string) =>
    createNoteError(
      NoteErrorCodes.INVALID_SUPERTAG,
      `Invalid supertag: ${reason}`
    ),

  tagNotFound: (id: string) =>
    createNoteError(NoteErrorCodes.TAG_NOT_FOUND, `Tag not found: ${id}`),

  noteNotFound: (id: string) =>
    createNoteError(NoteErrorCodes.NOTE_NOT_FOUND, `Note not found: ${id}`),

  permissionDenied: (message = 'Permission denied') =>
    createNoteError(NoteErrorCodes.PERMISSION_DENIED, message),

  editPermissionDenied: () =>
    createNoteError(
      NoteErrorCodes.PERMISSION_DENIED,
      'You do not have permission to edit this note'
    ),

  ownerOnly: (action: string) =>
    createNoteError(
      NoteErrorCodes.PERMISSION_DENIED,
      `Only owner can ${action}`
    ),

  shareTokenNotFound: (token: string) =>
    createNoteError(
      NoteErrorCodes.SHARE_TOKEN_NOT_FOUND,
      `Share token not found: ${token}`
    ),

  contentOverwriteRefused: () =>
    createNoteError(
      NoteErrorCodes.CONTENT_OVERWRITE_REFUSED,
      'Refusing to overwrite non-trivial content with an empty document; pass force: true to override'
    ),

  internalError: (message: string) =>
    createNoteError(
      NoteErrorCodes.INTERNAL_ERROR,
      `Internal error: ${message}`
    ),

  persistenceError: (operation: string, id: string) =>
    createNoteError(
      NoteErrorCodes.INTERNAL_ERROR,
      `Failed to ${operation} note ${id}`
    ),
} as const;
