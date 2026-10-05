import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import type { ByokProvider } from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  userProviderKeys,
  userProviderModels,
  type Database,
} from '../../../../database';
import type {
  ListingKey,
  ProviderModelListing,
  UserProviderModelsRepository,
} from '../../domain/ports/user-provider-models.repository';
import { toByokProvider } from './byok-provider-column';

type StoredListing = ProviderModelListing & { readonly syncedAt: Date };

function toListing(
  row: typeof userProviderModels.$inferSelect
): ProviderModelListing {
  return {
    provider: toByokProvider(row.provider),
    keyFingerprint: row.keyFingerprint,
    modelIds: row.modelIds,
    syncedAt: row.syncedAt,
  };
}

@Injectable()
export class DrizzleUserProviderModelsRepository implements UserProviderModelsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async get(
    userId: string,
    provider: ByokProvider
  ): Promise<ProviderModelListing | null> {
    const [row] = await this.db
      .select()
      .from(userProviderModels)
      .where(
        and(
          eq(userProviderModels.userId, userId),
          eq(userProviderModels.provider, provider)
        )
      )
      .limit(1);
    return row ? toListing(row) : null;
  }

  async listForUser(userId: string): Promise<ProviderModelListing[]> {
    const rows = await this.db
      .select()
      .from(userProviderModels)
      .where(eq(userProviderModels.userId, userId))
      .orderBy(asc(userProviderModels.provider));
    return rows.map(toListing);
  }

  async save(userId: string, listing: StoredListing): Promise<void> {
    const values = this.toValues(userId, listing);
    await this.db
      .insert(userProviderModels)
      .values(values)
      .onConflictDoUpdate({
        target: [userProviderModels.userId, userProviderModels.provider],
        set: {
          keyFingerprint: values.keyFingerprint,
          modelIds: values.modelIds,
          syncedAt: values.syncedAt,
        },
      });
  }

  async replace(
    userId: string,
    listing: StoredListing,
    expectedFingerprint: string | null
  ): Promise<boolean> {
    const values = this.toValues(userId, listing);
    const written =
      expectedFingerprint === null
        ? await this.db
            .insert(userProviderModels)
            .values(values)
            .onConflictDoNothing()
            .returning({ userId: userProviderModels.userId })
        : await this.db
            .update(userProviderModels)
            .set({
              keyFingerprint: values.keyFingerprint,
              modelIds: values.modelIds,
              syncedAt: values.syncedAt,
            })
            .where(
              and(
                eq(userProviderModels.userId, userId),
                eq(userProviderModels.provider, listing.provider),
                eq(userProviderModels.keyFingerprint, expectedFingerprint)
              )
            )
            .returning({ userId: userProviderModels.userId });
    return written.length > 0;
  }

  async findDue(
    olderThan: Date,
    limit: number,
    after: ListingKey | null
  ): Promise<ListingKey[]> {
    const rows = await this.db
      .select({
        userId: userProviderKeys.userId,
        provider: userProviderKeys.provider,
      })
      .from(userProviderKeys)
      .leftJoin(
        userProviderModels,
        and(
          eq(userProviderModels.userId, userProviderKeys.userId),
          eq(userProviderModels.provider, userProviderKeys.provider)
        )
      )
      .where(
        and(
          or(
            isNull(userProviderModels.userId),
            isNull(userProviderModels.syncedAt),
            lt(userProviderModels.syncedAt, olderThan),
            lt(userProviderModels.syncedAt, userProviderKeys.updatedAt)
          ),
          after
            ? sql`(${userProviderKeys.userId}, ${userProviderKeys.provider}) > (${after.userId}, ${after.provider})`
            : undefined
        )
      )
      .orderBy(asc(userProviderKeys.userId), asc(userProviderKeys.provider))
      .limit(limit);
    return rows.map((r) => ({
      userId: r.userId,
      provider: toByokProvider(r.provider),
    }));
  }

  private toValues(userId: string, listing: StoredListing) {
    return {
      userId,
      provider: listing.provider,
      keyFingerprint: listing.keyFingerprint,
      modelIds: [...listing.modelIds],
      syncedAt: listing.syncedAt,
    };
  }
}
