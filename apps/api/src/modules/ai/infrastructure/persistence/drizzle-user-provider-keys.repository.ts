import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import {
  BYOK_PROVIDERS,
  type ByokProvider,
  type EncryptedSecret,
  type ProviderKeyInfo,
} from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  userProviderKeys,
  type Database,
} from '../../../../database';
import type {
  StoredProviderKey,
  UserProviderKeysRepository,
} from '../../domain/ports/user-provider-keys.repository';

const BYOK_PROVIDER_SET = new Set<string>(BYOK_PROVIDERS);

function toByokProvider(raw: string): ByokProvider {
  if (!BYOK_PROVIDER_SET.has(raw)) {
    throw new Error(`Invalid BYOK provider value in persistence: ${raw}`);
  }
  return raw as ByokProvider;
}

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
      provider: toByokProvider(r.provider),
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
    return rows.map((r) => toByokProvider(r.provider));
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
      )
      .returning({ userId: userProviderKeys.userId });
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
      )
      .returning({ userId: userProviderKeys.userId });
  }
}
