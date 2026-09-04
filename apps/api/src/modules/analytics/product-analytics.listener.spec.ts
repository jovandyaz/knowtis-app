import {
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
  UserRegisteredEvent,
} from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpKeyCreatedEvent } from '../mcp/mcp-key-created.event';
import { NoteCreatedEvent, NoteSharedEvent } from '../notes/domain/events';
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

  it('maps admins to internal actors and defaults a missing locale to es', async () => {
    findById.mockResolvedValue({ ...USER, role: 'admin', locale: null });

    await listener.handleNoteShared(
      new NoteSharedEvent(USER.id, 'link', 'viewer')
    );

    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          actor_type: 'registered',
          is_internal: true,
          locale: 'es',
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
});
