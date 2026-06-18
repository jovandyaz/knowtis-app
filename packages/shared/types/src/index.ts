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
  MODEL_TIERS,
  type AIAction,
  type AILanguage,
  type AITone,
  type ModelTier,
  type SelectableModel,
  type AIPreferences,
} from './lib/ai.types';

export {
  ARTIFACT_TYPE,
  ARTIFACT_TYPES,
  type ArtifactType,
  type FlashcardDifficulty,
  type FlashcardContent,
  type QuizContent,
  type SummaryContent,
  type MindMapNode,
  type MindMapContent,
  type ArtifactContent,
  type Artifact,
  type FlashcardArtifact,
  type QuizArtifact,
  type SummaryArtifact,
  type MindMapArtifact,
  SM2_QUALITY,
  type SM2Quality,
  type FlashcardProgress,
  type QuizAttempt,
  type StudyStats,
  CARD_SESSION_STATUSES,
  type CardSessionStatus,
  CARD_STATUS,
  RESTART_FILTERS,
  type RestartFilter,
  type CardResult,
  type StudySessionResult,
} from './lib/artifact.types';
