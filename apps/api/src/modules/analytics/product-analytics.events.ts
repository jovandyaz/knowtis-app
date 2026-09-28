import type { EmailVerificationSource } from '@jovandyaz/auth/server';

import type {
  AccessTier,
  ArtifactType,
  FlashcardReviewKind,
  McpScopeLevel,
  NoteShareType,
  PermissionLevel,
  ProductActorContext,
  ProductEventName,
  ProductPersonProperties,
  QuizAttemptScope,
  QuizScoreBucket,
  QuotaRemainingBucket,
} from '@knowtis/shared-types';

export type ServerActorContext = ProductActorContext;

export type ServerPersonProperties = ProductPersonProperties;

export interface ServerProductEventMap {
  'user signed up': { source: 'api' };
  'email verified': {
    source: 'api';
    verification_method: EmailVerificationSource;
  };
  'note created': { source: 'api'; actor_type: 'registered' };
  'note shared': {
    source: 'api';
    share_type: NoteShareType;
    permission: PermissionLevel;
  };
  'mcp key created': { source: 'api'; scope_level: McpScopeLevel };
  'study artifact generated': { source: 'api'; artifact_type: ArtifactType };
  'flashcard reviewed': {
    source: 'api';
    quality: number;
    kind: FlashcardReviewKind;
  };
  'quiz completed': {
    source: 'api';
    scope: QuizAttemptScope;
    score_bucket: QuizScoreBucket;
  };
  'ai quota consumed': {
    source: 'api';
    tier: AccessTier;
    remaining_bucket: QuotaRemainingBucket;
  };
  'ai quota exhausted': { source: 'api'; tier: AccessTier };
}

export type ServerProductEventName = keyof ServerProductEventMap &
  ProductEventName;
