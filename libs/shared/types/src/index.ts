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

export {
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
  type FeatureFlagDto,
} from './lib/feature-flags.types';

export { ANONYMOUS_LIMITS, type AnonymousLimits } from './lib/anonymous.types';

export {
  AI_ACTION,
  AI_ACTIONS,
  AI_LANGUAGES,
  AI_TONES,
  type AIAction,
  type AILanguage,
  type AITone,
} from './lib/ai.types';

export {
  ARTIFACT_TYPE,
  ARTIFACT_TYPES,
  type ArtifactType,
  type FlashcardContent,
  type QuizContent,
  type SummaryContent,
  type MindMapNode,
  type MindMapContent,
  type OutlineContent,
  type ArtifactContent,
  type Artifact,
  type FlashcardProgress,
  type QuizAttempt,
  type StudyStats,
} from './lib/artifact.types';
