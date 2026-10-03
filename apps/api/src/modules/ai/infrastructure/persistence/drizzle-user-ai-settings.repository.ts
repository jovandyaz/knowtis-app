import { Inject, Injectable } from '@nestjs/common';
import { and, eq, notExists, or, sql } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

import {
  isByokProvider,
  isModelIntent,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  userAiSettings,
  userProviderKeys,
  type Database,
} from '../../../../database';
import type {
  UserAiSettings,
  UserAiSettingsRepository,
} from '../../domain/ports/user-ai-settings.repository';

function toIntent(value: string | null): ModelIntent | null {
  return value !== null && isModelIntent(value) ? value : null;
}

function toProvider(value: string | null): ByokProvider | null {
  return value !== null && isByokProvider(value) ? value : null;
}

@Injectable()
export class DrizzleUserAiSettingsRepository implements UserAiSettingsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async getSettings(userId: string): Promise<UserAiSettings> {
    const [row] = await this.db
      .select({
        preferredModel: userAiSettings.preferredModel,
        preferredIntent: userAiSettings.preferredIntent,
        primaryProvider: userAiSettings.primaryProvider,
        ghostTextEnabled: userAiSettings.ghostTextEnabled,
      })
      .from(userAiSettings)
      .where(eq(userAiSettings.userId, userId))
      .limit(1);
    return {
      preferredModel: row?.preferredModel ?? null,
      preferredIntent: toIntent(row?.preferredIntent ?? null),
      primaryProvider: toProvider(row?.primaryProvider ?? null),
      ghostTextEnabled: row?.ghostTextEnabled ?? true,
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

  async clearBoundToUnheldProvider(
    userId: string,
    provider: ByokProvider
  ): Promise<void> {
    const modelOnProvider = sql`split_part(${userAiSettings.preferredModel}, ':', 1) = ${provider}`;
    const primaryIsProvider = eq(userAiSettings.primaryProvider, provider);
    const heldKey = new QueryBuilder()
      .select({ provider: userProviderKeys.provider })
      .from(userProviderKeys)
      .where(
        and(
          eq(userProviderKeys.userId, userId),
          eq(userProviderKeys.provider, provider)
        )
      );
    await this.db
      .update(userAiSettings)
      .set({
        preferredModel: sql`CASE WHEN ${modelOnProvider} THEN NULL ELSE ${userAiSettings.preferredModel} END`,
        primaryProvider: sql`CASE WHEN ${primaryIsProvider} THEN NULL ELSE ${userAiSettings.primaryProvider} END`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(userAiSettings.userId, userId),
          or(modelOnProvider, primaryIsProvider),
          notExists(heldKey)
        )
      )
      .returning({ userId: userAiSettings.userId });
  }
}
