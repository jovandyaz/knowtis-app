export type {
  User,
  UserProfile,
  CreateUserInput,
  UpdateUserInput,
} from './lib/user.types';

export {
  NOTE_TITLE_MAX_LENGTH,
  PERMISSION,
  ACCESS,
  PERMISSION_LEVELS,
  ACCESS_LEVELS,
  GENERAL_ACCESS,
  GENERAL_ACCESS_LEVELS,
  type Note,
  type NoteWithOwner,
  type CreateNoteInput,
  type UpdateNoteInput,
  type PermissionLevel,
  type NoteAccessLevel,
  type GeneralAccessLevel,
  type NotePermission,
  type ShareNoteInput,
} from './lib/note.types';

export {
  PASSWORD_REQUIREMENTS,
  getPasswordChecks,
  type LoginInput,
  type RegisterInput,
  type AuthTokens,
  type AuthResponse,
  type RequestUser,
  type PasswordRequirements,
  type PasswordCheck,
} from './lib/auth.types';

export {
  COLLABORATION_EVENTS,
  type CollaborationEventType,
  type CollaborationUser,
  type JoinRoomPayload,
  type SyncUpdatePayload,
  type AwarenessUpdatePayload,
  type InitialStateResponse,
  type CollaborationError,
  type UserJoinedPayload,
  type UserLeftPayload,
} from './lib/collaboration.types';
