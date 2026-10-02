import {
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
  UserRegisteredEvent,
} from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONTINUABLE_STOP_REASONS,
  type QuizScoreBucket,
} from '@knowtis/shared-types';

import { TurnCheckpointReachedEvent } from '../agent/domain/events/turn-checkpoint-reached.event';
import { TurnContinuedEvent } from '../agent/domain/events/turn-continued.event';
import { ByokKeyFailedEvent } from '../ai/domain/events/byok-key-failed.event';
import { MessageQuotaConsumedEvent } from '../ai/domain/events/message-quota-consumed.event';
import { MessageQuotaExhaustedEvent } from '../ai/domain/events/message-quota-exhausted.event';
import { ArtifactGeneratedEvent } from '../artifacts/domain/events/artifact-generated.event';
import { FlashcardReviewedEvent } from '../artifacts/domain/events/flashcard-reviewed.event';
import { QuizCompletedEvent } from '../artifacts/domain/events/quiz-completed.event';
import { McpKeyCreatedEvent } from '../mcp/mcp-key-created.event';
import { NoteCreatedEvent } from '../notes/domain/events/note-created.event';
import { NoteSharedEvent } from '../notes/domain/events/note-shared.event';
import type { UsersService } from '../users/users.service';
import { ProductAnalyticsListener } from './product-analytics.listener';
import type { ProductAnalytics } from './product-analytics.service';

const USER = {
  id: 'user-1',
  email: 'person@example.com',
  name: 'Person',
  avatarUrl: null,
  provider: 'local',
  providerId: null,
  passwordHash: 'private-password-hash',
  locale: 'en',
  isAnonymous: false,
  role: 'user' as const,
  createdAt: new Date('2026-09-04T12:00:00.000Z'),
  emailVerifiedAt: new Date('2026-09-04T12:01:00.000Z'),
  updatedAt: new Date('2026-09-04T12:01:00.000Z'),
};

describe('ProductAnalyticsListener', () => {
  let capture: ReturnType<typeof vi.fn>;
  let findById: ReturnType<typeof vi.fn>;
  let listener: ProductAnalyticsListener;

  beforeEach(() => {
    capture = vi.fn();
    findById = vi.fn().mockResolvedValue(USER);
    listener = new ProductAnalyticsListener(
      { capture } as unknown as ProductAnalytics,
      { findById } as unknown as UsersService
    );
  });

  it('captures signup with only allowed actor and person properties', async () => {
    await listener.handleUserRegistered(
      new UserRegisteredEvent(
        USER.id,
        'event-email@example.com',
        'private-ip',
        'private-user-agent',
        new Date()
      )
    );

    expect(capture).toHaveBeenCalledWith({
      distinctId: USER.id,
      event: 'user signed up',
      properties: { source: 'api' },
      actor: {
        actor_type: 'registered',
        is_internal: false,
        locale: 'en',
      },
      personProperties: {
        email: USER.email,
        name: USER.name,
        role: 'user',
        locale: 'en',
        is_internal: false,
      },
    });
  });

  it('captures verification with its authoritative source and person properties', async () => {
    await listener.handleEmailVerified(
      new EmailVerifiedEvent(
        USER.id,
        EMAIL_VERIFICATION_SOURCE.PASSWORD_RESET,
        new Date()
      )
    );

    expect(capture).toHaveBeenCalledWith({
      distinctId: USER.id,
      event: 'email verified',
      properties: {
        source: 'api',
        verification_method: 'password_reset',
      },
      actor: {
        actor_type: 'registered',
        is_internal: false,
        locale: 'en',
      },
      personProperties: {
        email: USER.email,
        name: USER.name,
        role: 'user',
        locale: 'en',
        is_internal: false,
      },
    });
  });

  it('captures registered note creation without note identifiers or content', async () => {
    await listener.handleNoteCreated(
      new NoteCreatedEvent('private-note-id', 'Private title', USER.id)
    );

    expect(capture).toHaveBeenCalledWith({
      distinctId: USER.id,
      event: 'note created',
      properties: { source: 'api', actor_type: 'registered' },
      actor: {
        actor_type: 'registered',
        is_internal: false,
        locale: 'en',
      },
    });
  });

  it('skips anonymous note creation', async () => {
    findById.mockResolvedValue({ ...USER, isAnonymous: true });

    await listener.handleNoteCreated(
      new NoteCreatedEvent('private-note-id', 'Private title', USER.id)
    );

    expect(capture).not.toHaveBeenCalled();
  });

  it.each([
    [
      new NoteSharedEvent(USER.id, 'collaborator', 'editor'),
      {
        event: 'note shared',
        properties: {
          source: 'api',
          share_type: 'collaborator',
          permission: 'editor',
        },
      },
    ],
    [
      new NoteSharedEvent(USER.id, 'link', 'viewer'),
      {
        event: 'note shared',
        properties: {
          source: 'api',
          share_type: 'link',
          permission: 'viewer',
        },
      },
    ],
    [
      new McpKeyCreatedEvent(USER.id, 'share'),
      {
        event: 'mcp key created',
        properties: { source: 'api', scope_level: 'share' },
      },
    ],
  ] as const)('captures $expected.event', async (event, expected) => {
    if (event instanceof NoteSharedEvent) {
      await listener.handleNoteShared(event);
    } else {
      await listener.handleMcpKeyCreated(event);
    }

    expect(capture).toHaveBeenCalledWith({
      distinctId: USER.id,
      ...expected,
      actor: {
        actor_type: 'registered',
        is_internal: false,
        locale: 'en',
      },
    });
  });

  it('maps admins to internal actors and defaults a missing locale to the workspace default', async () => {
    findById.mockResolvedValue({ ...USER, role: 'admin', locale: null });

    await listener.handleNoteShared(
      new NoteSharedEvent(USER.id, 'link', 'viewer')
    );

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          actor_type: 'registered',
          is_internal: true,
          locale: 'en',
        },
      })
    );
  });

  it('does not capture or throw when a user is missing', async () => {
    findById.mockResolvedValue(null);

    await expect(
      listener.handleMcpKeyCreated(new McpKeyCreatedEvent(USER.id, 'read'))
    ).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });

  it('does not throw or capture and logs only the event name on lookup failure', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    findById.mockRejectedValue(new Error('private lookup detail'));

    await expect(
      listener.handleEmailVerified(
        new EmailVerifiedEvent(
          'private-user-id',
          EMAIL_VERIFICATION_SOURCE.CODE,
          new Date()
        )
      )
    ).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Product analytics listener failed for event: auth.email.verified'
    );
    expect(errorSpy.mock.calls.flat().join(' ')).not.toMatch(
      /private-user-id|private lookup detail/
    );

    errorSpy.mockRestore();
  });

  it('captures study artifact generated with only the artifact type', async () => {
    await listener.handleArtifactGenerated(
      new ArtifactGeneratedEvent('artifact-1', USER.id, 'flashcard_deck')
    );
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: USER.id,
        event: 'study artifact generated',
        properties: { source: 'api', artifact_type: 'flashcard_deck' },
      })
    );
  });

  it('captures a flashcard review with quality and kind', async () => {
    await listener.handleFlashcardReviewed(
      new FlashcardReviewedEvent('artifact-1', USER.id, 3, 'due')
    );
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'flashcard reviewed',
        properties: { source: 'api', quality: 3, kind: 'due' },
      })
    );
  });

  it('buckets the quiz score and never sends the raw value', async () => {
    await listener.handleQuizCompleted(
      new QuizCompletedEvent('quiz-1', USER.id, 'full', 0.8)
    );
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'quiz completed',
        properties: { source: 'api', scope: 'full', score_bucket: '80-99' },
      })
    );
    await listener.handleQuizCompleted(
      new QuizCompletedEvent('quiz-1', USER.id, 'missed', 1)
    );
    expect(capture).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: 'quiz completed',
        properties: { source: 'api', scope: 'missed', score_bucket: '100' },
      })
    );
  });

  it('tags a server event from an anonymous session as an anonymous actor', async () => {
    findById.mockResolvedValue({ ...USER, isAnonymous: true });

    await listener.handleNoteShared(
      new NoteSharedEvent(USER.id, 'link', 'viewer')
    );

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'note shared',
        actor: expect.objectContaining({ actor_type: 'anonymous' }),
      })
    );
  });

  it.each([
    { used: 1, limit: 30, bucket: '>20%' },
    { used: 23, limit: 30, bucket: '>20%' },
    { used: 24, limit: 30, bucket: '1-20%' },
    { used: 4, limit: 5, bucket: '1-20%' },
    { used: 30, limit: 30, bucket: '0' },
    { used: 31, limit: 30, bucket: '0' },
    { used: 0, limit: 0, bucket: '0' },
  ])(
    'captures a consumed quota of $used/$limit as bucket $bucket, never the raw counts',
    async ({ used, limit, bucket }) => {
      await listener.handleQuotaConsumed(
        new MessageQuotaConsumedEvent(USER.id, 'free', used, limit)
      );

      expect(capture).toHaveBeenCalledWith(
        expect.objectContaining({
          distinctId: USER.id,
          event: 'ai quota consumed',
          properties: { source: 'api', tier: 'free', remaining_bucket: bucket },
        })
      );
    }
  );

  it('captures an exhausted anonymous quota as an anonymous actor', async () => {
    findById.mockResolvedValue({ ...USER, isAnonymous: true });

    await listener.handleQuotaExhausted(
      new MessageQuotaExhaustedEvent(USER.id, 'anonymous')
    );

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai quota exhausted',
        properties: { source: 'api', tier: 'anonymous' },
        actor: expect.objectContaining({ actor_type: 'anonymous' }),
      })
    );
  });

  it.each(CONTINUABLE_STOP_REASONS)(
    'captures a %s checkpoint with only its tier, stop reason and segment index',
    async (stopReason) => {
      await listener.handleTurnCheckpointReached(
        new TurnCheckpointReachedEvent(USER.id, 'free', stopReason, 1)
      );

      expect(capture).toHaveBeenCalledExactlyOnceWith({
        distinctId: USER.id,
        event: 'ai turn checkpoint reached',
        properties: {
          source: 'api',
          tier: 'free',
          stop_reason: stopReason,
          segment_index: 1,
        },
        actor: { actor_type: 'registered', is_internal: false, locale: 'en' },
      });
    }
  );

  it('captures a continuation with only its tier and segment index', async () => {
    findById.mockResolvedValue({ ...USER, isAnonymous: true });

    await listener.handleTurnContinued(
      new TurnContinuedEvent(USER.id, 'anonymous', 2)
    );

    expect(capture).toHaveBeenCalledExactlyOnceWith({
      distinctId: USER.id,
      event: 'ai turn continued',
      properties: { source: 'api', tier: 'anonymous', segment_index: 2 },
      actor: { actor_type: 'anonymous', is_internal: false, locale: 'en' },
    });
  });

  it('captures a failed BYOK key with only its provider and kind', async () => {
    await listener.handleByokKeyFailed(
      new ByokKeyFailedEvent(USER.id, 'openai', 'credit')
    );

    expect(capture).toHaveBeenCalledExactlyOnceWith({
      distinctId: USER.id,
      event: 'byok key failed',
      properties: { source: 'api', provider: 'openai', kind: 'credit' },
      actor: { actor_type: 'registered', is_internal: false, locale: 'en' },
    });
  });

  it('maps every score bucket boundary', async () => {
    const cases: Array<[number, QuizScoreBucket]> = [
      [0.2, '<50'],
      [0.5, '50-79'],
      [0.79, '50-79'],
      [0.8, '80-99'],
      [0.99, '80-99'],
      [1, '100'],
    ];
    for (const [score, bucket] of cases) {
      await listener.handleQuizCompleted(
        new QuizCompletedEvent('quiz-1', USER.id, 'full', score)
      );
      expect(capture).toHaveBeenLastCalledWith(
        expect.objectContaining({
          event: 'quiz completed',
          properties: { source: 'api', scope: 'full', score_bucket: bucket },
        })
      );
    }
  });
});
