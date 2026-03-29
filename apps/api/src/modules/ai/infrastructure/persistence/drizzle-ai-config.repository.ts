import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { aiConfig } from '../../../../database/schema';
import type { AIConfigRepository } from '../../domain/ports/ai-config.repository';

@Injectable()
export class DrizzleAIConfigRepository implements AIConfigRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async get(key: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(aiConfig)
      .where(eq(aiConfig.key, key))
      .limit(1);
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string, description?: string): Promise<void> {
    const now = new Date();
    await this.db
      .insert(aiConfig)
      .values({
        key,
        value,
        ...(description !== undefined && { description }),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: aiConfig.key,
        set: {
          value,
          ...(description !== undefined && { description }),
          updatedAt: now,
        },
      });
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.db.select().from(aiConfig);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
