import type { EmailVerificationSource } from '@jovandyaz/auth/server';

import type {
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
} from '@knowtis/shared-types';

export interface ServerActorContext extends ProductActorContext {
  actor_type: 'registered';
}

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
}

export type ServerProductEventName = keyof ServerProductEventMap &
  ProductEventName;
