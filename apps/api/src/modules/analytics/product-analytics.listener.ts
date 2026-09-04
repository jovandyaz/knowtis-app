import {
  AuthEventName,
  type EmailVerifiedEvent,
  type UserRegisteredEvent,
} from '@jovandyaz/auth/server';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { McpKeyCreatedEvent } from '../mcp/mcp-key-created.event';
import { NoteCreatedEvent, NoteSharedEvent } from '../notes/domain/events';
import { UsersService } from '../users/users.service';
import type {
  ServerActorContext,
  ServerPersonProperties,
} from './product-analytics.events';
import { ProductAnalytics } from './product-analytics.service';

type UserRecord = NonNullable<Awaited<ReturnType<UsersService['findById']>>>;

@Injectable()
export class ProductAnalyticsListener {
  private readonly logger = new Logger(ProductAnalyticsListener.name);

  constructor(
    private readonly analytics: ProductAnalytics,
    private readonly usersService: UsersService
  ) {}

  @OnEvent(AuthEventName.REGISTER, { async: true })
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    try {
      const user = await this.usersService.findById(event.userId);
      if (!user) {
        return;
      }

      this.analytics.capture({
        distinctId: user.id,
        event: 'user signed up',
        properties: { source: 'api' },
        actor: this.actorFor(user),
        personProperties: this.personPropertiesFor(user),
      });
    } catch {
      this.logFailure(AuthEventName.REGISTER);
    }
  }

  @OnEvent(AuthEventName.EMAIL_VERIFIED, { async: true })
  async handleEmailVerified(event: EmailVerifiedEvent): Promise<void> {
    try {
      const user = await this.usersService.findById(event.userId);
      if (!user) {
        return;
      }

      this.analytics.capture({
        distinctId: user.id,
        event: 'email verified',
        properties: {
          source: 'api',
          verification_method: event.source,
        },
        actor: this.actorFor(user),
        personProperties: this.personPropertiesFor(user),
      });
    } catch {
      this.logFailure(AuthEventName.EMAIL_VERIFIED);
    }
  }

  @OnEvent(NoteCreatedEvent.EVENT_NAME, { async: true })
  async handleNoteCreated(event: NoteCreatedEvent): Promise<void> {
    try {
      const user = await this.usersService.findById(event.ownerId);
      if (!user || user.isAnonymous) {
        return;
      }

      this.analytics.capture({
        distinctId: user.id,
        event: 'note created',
        properties: { source: 'api', actor_type: 'registered' },
        actor: this.actorFor(user),
      });
    } catch {
      this.logFailure(NoteCreatedEvent.EVENT_NAME);
    }
  }

  @OnEvent(NoteSharedEvent.EVENT_NAME, { async: true })
  async handleNoteShared(event: NoteSharedEvent): Promise<void> {
    try {
      const user = await this.usersService.findById(event.actorId);
      if (!user) {
        return;
      }

      this.analytics.capture({
        distinctId: user.id,
        event: 'note shared',
        properties: {
          source: 'api',
          share_type: event.shareType,
          permission: event.permission,
        },
        actor: this.actorFor(user),
      });
    } catch {
      this.logFailure(NoteSharedEvent.EVENT_NAME);
    }
  }

  @OnEvent(McpKeyCreatedEvent.EVENT_NAME, { async: true })
  async handleMcpKeyCreated(event: McpKeyCreatedEvent): Promise<void> {
    try {
      const user = await this.usersService.findById(event.userId);
      if (!user) {
        return;
      }

      this.analytics.capture({
        distinctId: user.id,
        event: 'mcp key created',
        properties: { source: 'api', scope_level: event.scopeLevel },
        actor: this.actorFor(user),
      });
    } catch {
      this.logFailure(McpKeyCreatedEvent.EVENT_NAME);
    }
  }

  private actorFor(user: UserRecord): ServerActorContext {
    return {
      actor_type: 'registered',
      is_internal: user.role === 'admin',
      locale: user.locale ?? 'es',
    };
  }

  private personPropertiesFor(user: UserRecord): ServerPersonProperties {
    const locale = user.locale ?? 'es';
    const isInternal = user.role === 'admin';

    return {
      email: user.email,
      name: user.name,
      role: user.role,
      locale,
      is_internal: isInternal,
    };
  }

  private logFailure(eventName: string): void {
    this.logger.error(
      `Product analytics listener failed for event: ${eventName}`
    );
  }
}
