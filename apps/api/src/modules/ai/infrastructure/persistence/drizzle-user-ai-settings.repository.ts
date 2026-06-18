import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import {
  DATABASE_CONNECTION,
  userAiSettings,
  type Database,
} from '../../../../database';
import type { UserAiSettingsRepository } from '../../domain/ports/user-ai-settings.repository';

@Injectable()
export class DrizzleUserAiSettingsRepository implements UserAiSettingsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async getPreferredModel(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ preferredModel: userAiSettings.preferredModel })
      .from(userAiSettings)
      .where(eq(userAiSettings.userId, userId))
      .limit(1);
    return row?.preferredModel ?? null;
  }

  async setPreferredModel(userId: string, model: string | null): Promise<void> {
    await this.db
      .insert(userAiSettings)
      .values({ userId, preferredModel: model })
      .onConflictDoUpdate({
        target: userAiSettings.userId,
        set: { preferredModel: model, updatedAt: sql`now()` },
      })
      .returning({ userId: userAiSettings.userId });
  }
}
