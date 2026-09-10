import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { z } from 'zod';

import { AccessRevalidationService } from './access-revalidation.service';

export const ACCESS_INVALIDATION_CHANNEL =
  'knowtis-collab:access-invalidations:v1';
/** Process-scoped so a Redis `CLIENT LIST` entry names exactly one API instance. */
export const ACCESS_INVALIDATION_SUBSCRIBER_CONNECTION_NAME = `knowtis-access-invalidations-sub:${process.pid}`;
const FAILURE_LOG_INTERVAL_MS = 30000;
const messageSchema = z
  .object({ version: z.literal(1), noteId: z.uuid() })
  .strict();

export function parseAccessInvalidation(payload: string): string | null {
  if (Buffer.byteLength(payload) > 256) {
    return null;
  }
  try {
    const result = messageSchema.safeParse(JSON.parse(payload));
    return result.success ? result.data.noteId : null;
  } catch {
    return null;
  }
}

@Injectable()
export class AccessInvalidationBus implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccessInvalidationBus.name);
  private publisher?: Redis;
  private subscriber?: Redis;
  private stopped = false;
  private subscriptionRetry?: ReturnType<typeof setTimeout>;
  private readonly lastFailureLogAt = {
    publisher: Number.NEGATIVE_INFINITY,
    subscriber: Number.NEGATIVE_INFINITY,
  };

  constructor(
    private readonly config: ConfigService,
    private readonly access: AccessRevalidationService
  ) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      return;
    }
    const options = {
      lazyConnect: true,
      connectTimeout: 1000,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    };
    this.publisher = new Redis(url, options);
    this.subscriber = new Redis(url, {
      ...options,
      autoResubscribe: false,
      connectionName: ACCESS_INVALIDATION_SUBSCRIBER_CONNECTION_NAME,
    });
    this.publisher.on('error', () =>
      this.warnFailure('publisher', 'connection_failed')
    );
    this.subscriber.on('error', () =>
      this.warnFailure('subscriber', 'connection_failed')
    );
    this.subscriber.on('ready', () => {
      void this.subscribe();
    });
    this.subscriber.on('message', (channel, payload) => {
      if (this.stopped || channel !== ACCESS_INVALIDATION_CHANNEL) {
        return;
      }
      const noteId = parseAccessInvalidation(payload);
      if (noteId) {
        void this.access.invalidate(noteId);
      }
    });
    void this.publisher
      .connect()
      .catch(() => this.warnFailure('publisher', 'connection_failed'));
    void this.subscriber
      .connect()
      .catch(() => this.warnFailure('subscriber', 'connection_failed'));
  }

  async publish(noteId: string): Promise<void> {
    if (!this.publisher || this.stopped) {
      return;
    }
    await this.publisher.publish(
      ACCESS_INVALIDATION_CHANNEL,
      JSON.stringify({ version: 1, noteId })
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    clearTimeout(this.subscriptionRetry);
    for (const client of [this.publisher, this.subscriber]) {
      client?.removeAllListeners();
      client?.on('error', () => {});
      client?.disconnect();
    }
  }

  private async subscribe(): Promise<void> {
    if (this.stopped || !this.subscriber) {
      return;
    }
    clearTimeout(this.subscriptionRetry);
    try {
      await this.subscriber.subscribe(ACCESS_INVALIDATION_CHANNEL);
      if (!this.stopped) {
        await this.access.invalidateAll();
      }
    } catch {
      this.warnFailure('subscriber', 'subscription_failed');
      if (!this.stopped) {
        this.subscriptionRetry = setTimeout(() => {
          void this.subscribe();
        }, 1000);
        this.subscriptionRetry.unref?.();
      }
    }
  }

  private warnFailure(
    clientRole: 'publisher' | 'subscriber',
    reason: 'connection_failed' | 'subscription_failed'
  ): void {
    if (this.stopped) {
      return;
    }
    const now = performance.now();
    if (now - this.lastFailureLogAt[clientRole] < FAILURE_LOG_INTERVAL_MS) {
      return;
    }
    this.lastFailureLogAt[clientRole] = now;
    this.logger.warn({
      operation: 'access_invalidation_redis',
      clientRole,
      reason,
    });
  }
}
