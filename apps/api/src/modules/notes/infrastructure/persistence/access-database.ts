import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../../../../database/schema';

export const ACCESS_DATABASE_CONNECTION = Symbol('ACCESS_DATABASE_CONNECTION');

@Injectable()
export class AccessDatabase implements OnModuleDestroy {
  private readonly logger = new Logger(AccessDatabase.name);
  readonly client;
  readonly db;

  constructor(config: ConfigService) {
    const url = new URL(config.getOrThrow<string>('DATABASE_URL'));
    // Strip these because postgres.js applies URL session settings after these security defaults.
    for (const key of ['statement_timeout', 'options', 'application_name']) {
      url.searchParams.delete(key);
    }
    this.client = postgres(url.toString(), {
      max: 2,
      connect_timeout: 1,
      idle_timeout: 20,
      target_session_attrs: 'read-write',
      connection: {
        statement_timeout: 900,
        application_name: 'knowtis-access-authority',
      },
    });
    this.db = drizzle(this.client, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    const started = performance.now();
    await this.client.end({ timeout: 1 });
    this.logger.debug({
      operation: 'access_pool_teardown',
      durationMs: Math.round(performance.now() - started),
    });
  }
}
