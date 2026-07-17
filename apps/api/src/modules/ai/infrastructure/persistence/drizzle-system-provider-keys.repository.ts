import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import {
  AI_PROVIDERS,
  type AIProvider,
  type EncryptedSecret,
} from '@knowtis/shared-types';

import {
  DATABASE_CONNECTION,
  systemProviderKeys,
  type Database,
} from '../../../../database';
import type {
  SystemProviderKeyRow,
  SystemProviderKeysRepository,
} from '../../domain/ports/system-provider-keys.repository';

const AI_PROVIDER_SET = new Set<string>(AI_PROVIDERS);

function toAIProvider(raw: string): AIProvider {
  if (!AI_PROVIDER_SET.has(raw)) {
    throw new Error(`Invalid AI provider value in persistence: ${raw}`);
  }
  return raw as AIProvider;
}

@Injectable()
export class DrizzleSystemProviderKeysRepository implements SystemProviderKeysRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async getAll(): Promise<SystemProviderKeyRow[]> {
    const rows = await this.db
      .select({
        provider: systemProviderKeys.provider,
        enabled: systemProviderKeys.enabled,
        ciphertext: systemProviderKeys.ciphertext,
        iv: systemProviderKeys.iv,
        authTag: systemProviderKeys.authTag,
        keyPrefix: systemProviderKeys.keyPrefix,
        updatedAt: systemProviderKeys.updatedAt,
      })
      .from(systemProviderKeys);
    return rows.map((r) => ({
      provider: toAIProvider(r.provider),
      enabled: r.enabled,
      secret: toSecret(r),
      keyPrefix: r.keyPrefix,
      updatedAt: r.updatedAt,
    }));
  }

  async setKey(
    provider: AIProvider,
    secret: EncryptedSecret,
    keyPrefix: string,
    actorId: string
  ): Promise<void> {
    await this.db
      .insert(systemProviderKeys)
      .values({ provider, ...secret, keyPrefix, updatedBy: actorId })
      .onConflictDoUpdate({
        target: systemProviderKeys.provider,
        set: {
          ...secret,
          keyPrefix,
          updatedBy: actorId,
          updatedAt: sql`now()`,
        },
      })
      .returning({ provider: systemProviderKeys.provider });
  }

  async setEnabled(
    provider: AIProvider,
    enabled: boolean,
    actorId: string
  ): Promise<void> {
    await this.db
      .insert(systemProviderKeys)
      .values({ provider, enabled, updatedBy: actorId })
      .onConflictDoUpdate({
        target: systemProviderKeys.provider,
        set: { enabled, updatedBy: actorId, updatedAt: sql`now()` },
      })
      .returning({ provider: systemProviderKeys.provider });
  }

  async clearKey(provider: AIProvider, actorId: string): Promise<boolean> {
    const rows = await this.db
      .update(systemProviderKeys)
      .set({
        ciphertext: null,
        iv: null,
        authTag: null,
        keyPrefix: null,
        updatedBy: actorId,
        updatedAt: sql`now()`,
      })
      .where(eq(systemProviderKeys.provider, provider))
      .returning({ provider: systemProviderKeys.provider });
    return rows.length > 0;
  }
}

function toSecret(row: {
  ciphertext: string | null;
  iv: string | null;
  authTag: string | null;
}): EncryptedSecret | null {
  // The secret_complete CHECK keeps the three parts together; this narrows them.
  if (!row.ciphertext || !row.iv || !row.authTag) {
    return null;
  }
  return { ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag };
}
