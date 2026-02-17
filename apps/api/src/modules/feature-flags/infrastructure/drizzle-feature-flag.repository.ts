import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  DATABASE_CONNECTION,
  featureFlags,
  type Database,
} from '../../../database';
import type {
  FeatureFlagEntity,
  FeatureFlagRepository,
  UpsertFeatureFlagData,
} from '../domain/feature-flag.repository';

@Injectable()
export class DrizzleFeatureFlagRepository implements FeatureFlagRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async findByKey(key: string): Promise<FeatureFlagEntity | null> {
    const result = await this.db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToEntity(result[0]);
  }

  async findAll(): Promise<FeatureFlagEntity[]> {
    const result = await this.db.select().from(featureFlags);
    return result.map((row) => this.mapToEntity(row));
  }

  async upsert(data: UpsertFeatureFlagData): Promise<FeatureFlagEntity> {
    const now = new Date();
    const result = await this.db
      .insert(featureFlags)
      .values({
        key: data.key,
        enabled: data.enabled,
        description: data.description ?? null,
      })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: {
          enabled: data.enabled,
          description: data.description ?? undefined,
          updatedAt: now,
        },
      })
      .returning();

    return this.mapToEntity(result[0]);
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(featureFlags).where(eq(featureFlags.key, key));
  }

  private mapToEntity(
    row: typeof featureFlags.$inferSelect
  ): FeatureFlagEntity {
    return {
      key: row.key,
      enabled: row.enabled,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
