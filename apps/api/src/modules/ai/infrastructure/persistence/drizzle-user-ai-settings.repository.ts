import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { isModelIntent, type ModelIntent } from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  userAiSettings,
  type Database,
} from '../../../../database';
import type {
  UserAiSettings,
  UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';

function toIntent(value: string | null): ModelIntent | null {
  return value !== null && isModelIntent(value) ? value : null;
}

@Injectable()
export class DrizzleUserAiSettingsRepository implements UserAiSettingsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async getSettings(userId: string): Promise<UserAiSettings> {
    const [row] = await this.db
      .select({
        preferredModel: userAiSettings.preferredModel,
        preferredIntent: userAiSettings.preferredIntent,
      })
      .from(userAiSettings)
      .where(eq(userAiSettings.userId, userId))
      .limit(1);
    return {
      preferredModel: row?.preferredModel ?? null,
      preferredIntent: toIntent(row?.preferredIntent ?? null),
    };
  }

  async patchSettings(
    userId: string,
    patch: Partial<UserAiSettings>
  ): Promise<void> {
    // Drizzle's update-set drops undefined entries, so untouched fields stay put.
    await this.db
      .insert(userAiSettings)
      .values({ userId, ...patch })
      .onConflictDoUpdate({
        target: userAiSettings.userId,
        set: { ...patch, updatedAt: sql`now()` },
      })
      .returning({ userId: userAiSettings.userId });
  }
}
