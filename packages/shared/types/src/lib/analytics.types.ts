/**
 * Product analytics vocabulary shared by the API and the Notes browser app so
 * both emitters agree on event names and categorical property values.
 */
export const PRODUCT_EVENT_NAMES = [
  'user signed up',
  'email verified',
  'note created',
  'note activated',
  'note shared',
  'shared note viewed',
  'ai response completed',
  'mcp key created',
  'study artifact generated',
  'study session started',
  'study session completed',
  'flashcard reviewed',
  'quiz completed',
] as const;
export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export const PRODUCT_ACTOR_TYPES = ['anonymous', 'registered'] as const;
export type ProductActorType = (typeof PRODUCT_ACTOR_TYPES)[number];

export const PRODUCT_USER_ROLES = ['user', 'admin'] as const;
export type ProductUserRole = (typeof PRODUCT_USER_ROLES)[number];

export const NOTE_SHARE_TYPES = ['link', 'collaborator'] as const;
export type NoteShareType = (typeof NOTE_SHARE_TYPES)[number];

export const MCP_SCOPE_LEVELS = ['read', 'write', 'share'] as const;
export type McpScopeLevel = (typeof MCP_SCOPE_LEVELS)[number];

export const AI_ASSISTANT_TYPES = ['selection', 'agent', 'ghost_text'] as const;
export type AIAssistantType = (typeof AI_ASSISTANT_TYPES)[number];

export const STUDY_SESSION_SOURCES = ['note', 'queue'] as const;
export type StudySessionSource = (typeof STUDY_SESSION_SOURCES)[number];

export const STUDY_DURATION_BUCKETS = ['<2m', '2-5m', '5-15m', '>15m'] as const;
export type StudyDurationBucket = (typeof STUDY_DURATION_BUCKETS)[number];

export const QUIZ_SCORE_BUCKETS = ['<50', '50-79', '80-99', '100'] as const;
export type QuizScoreBucket = (typeof QUIZ_SCORE_BUCKETS)[number];

export const FLASHCARD_REVIEW_KINDS = ['due', 'new', 'early'] as const;
export type FlashcardReviewKind = (typeof FLASHCARD_REVIEW_KINDS)[number];

export const FLASHCARD_REVIEW_KIND = {
  DUE: 'due',
  NEW: 'new',
  EARLY: 'early',
} as const satisfies Record<string, FlashcardReviewKind>;

/** Common properties every product event carries about the acting user. */
export interface ProductActorContext {
  actor_type: ProductActorType;
  is_internal: boolean;
  locale: string;
}

/** The only person properties identification may set. */
export interface ProductPersonProperties {
  email: string;
  name: string;
  role: ProductUserRole;
  locale: string;
  is_internal: boolean;
}
