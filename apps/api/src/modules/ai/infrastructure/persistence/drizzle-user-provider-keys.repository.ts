import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { ByokProvider, ProviderKeyInfo } from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  userProviderKeys,
  type Database,
} from '../../../../database';
import type {
  StoredProviderKey,
  UserProviderKeysRepository,
} from '../../domain/ports/user-provider-keys.repository';
import type { EncryptedSecret } from '../crypto/secret-cipher';

@Injectable()
export class DrizzleUserProviderKeysRepository implements UserProviderKeysRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async listForUser(userId: string): Promise<ProviderKeyInfo[]> {
    const rows = await this.db
      .select({
        provider: userProviderKeys.provider,
        keyPrefix: userProviderKeys.keyPrefix,
        lastUsedAt: userProviderKeys.lastUsedAt,
        createdAt: userProviderKeys.createdAt,
      })
      .from(userProviderKeys)
      .where(eq(userProviderKeys.userId, userId));
    return rows.map((r) => ({
      provider: r.provider as ByokProvider,
      keyPrefix: r.keyPrefix,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getEnabledProviders(userId: string): Promise<ByokProvider[]> {
    const rows = await this.db
      .select({ provider: userProviderKeys.provider })
      .from(userProviderKeys)
      .where(eq(userProviderKeys.userId, userId));
    return rows.map((r) => r.provider as ByokProvider);
  }

  async getEncrypted(
    userId: string,
    provider: ByokProvider
  ): Promise<StoredProviderKey | null> {
    const [row] = await this.db
      .select({
        ciphertext: userProviderKeys.ciphertext,
        iv: userProviderKeys.iv,
        authTag: userProviderKeys.authTag,
        keyPrefix: userProviderKeys.keyPrefix,
      })
      .from(userProviderKeys)
      .where(
        and(
          eq(userProviderKeys.userId, userId),
          eq(userProviderKeys.provider, provider)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async upsert(
    userId: string,
    provider: ByokProvider,
    secret: EncryptedSecret,
    keyPrefix: string
  ): Promise<void> {
    await this.db
      .insert(userProviderKeys)
      .values({ userId, provider, ...secret, keyPrefix })
      .onConflictDoUpdate({
        target: [userProviderKeys.userId, userProviderKeys.provider],
        set: { ...secret, keyPrefix, updatedAt: sql`now()` },
      })
      .returning({ userId: userProviderKeys.userId });
  }

  async remove(userId: string, provider: ByokProvider): Promise<void> {
    await this.db
      .delete(userProviderKeys)
      .where(
        and(
          eq(userProviderKeys.userId, userId),
          eq(userProviderKeys.provider, provider)
        )
      );
  }

  async touchLastUsed(userId: string, provider: ByokProvider): Promise<void> {
    await this.db
      .update(userProviderKeys)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(userProviderKeys.userId, userId),
          eq(userProviderKeys.provider, provider)
        )
      );
  }
}
