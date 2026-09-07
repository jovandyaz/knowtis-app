import {
  AuthEventName,
  type EmailVerifiedEvent,
  type UserRegisteredEvent,
} from '@jovandyaz/auth/server';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import type { QuizScoreBucket } from '@knowtis/shared-types';
import { DEFAULT_LOCALE } from '@knowtis/shared-util';

import { ArtifactGeneratedEvent } from '../artifacts/domain/events/artifact-generated.event';
import { FlashcardReviewedEvent } from '../artifacts/domain/events/flashcard-reviewed.event';
import { QuizCompletedEvent } from '../artifacts/domain/events/quiz-completed.event';
import { McpKeyCreatedEvent } from '../mcp/mcp-key-created.event';
import { NoteCreatedEvent } from '../notes/domain/events/note-created.event';
import { NoteSharedEvent } from '../notes/domain/events/note-shared.event';
import { UsersService } from '../users/users.service';
import type {
  ServerPersonProperties,
  ServerProductEventMap,
  ServerProductEventName,
} from './product-analytics.events';
import { ProductAnalytics } from './product-analytics.service';

type UserRecord = NonNullable<Awaited<ReturnType<UsersService['findById']>>>;

const QUIZ_SCORE_MID_FLOOR = 0.5;
const QUIZ_SCORE_HIGH_FLOOR = 0.8;
const QUIZ_SCORE_PERFECT = 1;

function scoreBucketFor(score: number): QuizScoreBucket {
  if (score >= QUIZ_SCORE_PERFECT) {
    return '100';
  }
  if (score >= QUIZ_SCORE_HIGH_FLOOR) {
    return '80-99';
  }
  if (score >= QUIZ_SCORE_MID_FLOOR) {
    return '50-79';
  }
  return '<50';
}

interface UserEventCapture<E extends ServerProductEventName> {
  event: E;
  properties: ServerProductEventMap[E];
  identifyPerson?: boolean;
}

@Injectable()
export class ProductAnalyticsListener {
  private readonly logger = new Logger(ProductAnalyticsListener.name);

  constructor(
    private readonly analytics: ProductAnalytics,
    private readonly usersService: UsersService
  ) {}

  @OnEvent(AuthEventName.REGISTER, { async: true })
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    await this.captureForUser(AuthEventName.REGISTER, event.userId, () => ({
      event: 'user signed up',
      properties: { source: 'api' },
      identifyPerson: true,
    }));
  }

  @OnEvent(AuthEventName.EMAIL_VERIFIED, { async: true })
  async handleEmailVerified(event: EmailVerifiedEvent): Promise<void> {
    await this.captureForUser(
      AuthEventName.EMAIL_VERIFIED,
      event.userId,
      () => ({
        event: 'email verified',
        properties: { source: 'api', verification_method: event.source },
        identifyPerson: true,
      })
    );
  }

  @OnEvent(NoteCreatedEvent.EVENT_NAME, { async: true })
  async handleNoteCreated(event: NoteCreatedEvent): Promise<void> {
    await this.captureForUser(
      NoteCreatedEvent.EVENT_NAME,
      event.ownerId,
      (user) =>
        user.isAnonymous
          ? null
          : {
              event: 'note created',
              properties: { source: 'api', actor_type: 'registered' },
            }
    );
  }

  @OnEvent(NoteSharedEvent.EVENT_NAME, { async: true })
  async handleNoteShared(event: NoteSharedEvent): Promise<void> {
    await this.captureForUser(
      NoteSharedEvent.EVENT_NAME,
      event.actorId,
      () => ({
        event: 'note shared',
        properties: {
          source: 'api',
          share_type: event.shareType,
          permission: event.permission,
        },
      })
    );
  }

  @OnEvent(McpKeyCreatedEvent.EVENT_NAME, { async: true })
  async handleMcpKeyCreated(event: McpKeyCreatedEvent): Promise<void> {
    await this.captureForUser(
      McpKeyCreatedEvent.EVENT_NAME,
      event.userId,
      () => ({
        event: 'mcp key created',
        properties: { source: 'api', scope_level: event.scopeLevel },
      })
    );
  }

  @OnEvent(ArtifactGeneratedEvent.EVENT_NAME, { async: true })
  async handleArtifactGenerated(event: ArtifactGeneratedEvent): Promise<void> {
    await this.captureForUser(
      ArtifactGeneratedEvent.EVENT_NAME,
      event.userId,
      () => ({
        event: 'study artifact generated',
        properties: { source: 'api', artifact_type: event.artifactType },
      })
    );
  }

  @OnEvent(FlashcardReviewedEvent.EVENT_NAME, { async: true })
  async handleFlashcardReviewed(event: FlashcardReviewedEvent): Promise<void> {
    await this.captureForUser(
      FlashcardReviewedEvent.EVENT_NAME,
      event.userId,
      () => ({
        event: 'flashcard reviewed',
        properties: { source: 'api', quality: event.quality, kind: event.kind },
      })
    );
  }

  @OnEvent(QuizCompletedEvent.EVENT_NAME, { async: true })
  async handleQuizCompleted(event: QuizCompletedEvent): Promise<void> {
    await this.captureForUser(
      QuizCompletedEvent.EVENT_NAME,
      event.userId,
      () => ({
        event: 'quiz completed',
        properties: {
          source: 'api',
          scope: event.scope,
          score_bucket: scoreBucketFor(event.score),
        },
      })
    );
  }

  private async captureForUser<E extends ServerProductEventName>(
    eventName: string,
    userId: string,
    build: (user: UserRecord) => UserEventCapture<E> | null
  ): Promise<void> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user) {
        return;
      }
      const capture = build(user);
      if (!capture) {
        return;
      }

      const traits = this.traitsFor(user);
      this.analytics.capture({
        distinctId: user.id,
        event: capture.event,
        properties: capture.properties,
        actor: {
          actor_type: 'registered',
          is_internal: traits.isInternal,
          locale: traits.locale,
        },
        ...(capture.identifyPerson
          ? { personProperties: this.personPropertiesFor(user) }
          : {}),
      });
    } catch {
      this.logger.error(
        `Product analytics listener failed for event: ${eventName}`
      );
    }
  }

  private traitsFor(user: UserRecord): {
    locale: string;
    isInternal: boolean;
  } {
    return {
      locale: user.locale ?? DEFAULT_LOCALE,
      isInternal: user.role === 'admin',
    };
  }

  private personPropertiesFor(user: UserRecord): ServerPersonProperties {
    const traits = this.traitsFor(user);
    return {
      email: user.email,
      name: user.name,
      role: user.role,
      locale: traits.locale,
      is_internal: traits.isInternal,
    };
  }
}
