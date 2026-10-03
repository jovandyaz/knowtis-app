import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ByokProvider } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  userAiSettings,
  userProviderKeys,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import type { UserAiSettings } from '../../domain/ports/user-ai-settings.repository';
import { DrizzleUserAiSettingsRepository } from './drizzle-user-ai-settings.repository';

const USER_ID = '00000000-0000-4000-8000-0000000000c3';
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000c9';

describe.runIf(DB_AVAILABLE)('DrizzleUserAiSettingsRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleUserAiSettingsRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        DatabaseModule,
      ],
    }).compile();
    db = moduleRef.get<Database>(DATABASE_CONNECTION);
    repo = new DrizzleUserAiSettingsRepository(db);

    await db
      .insert(users)
      .values(
        [USER_ID, OTHER_USER_ID].map((id) => ({
          id,
          email: `e-${id}@test.local`,
          name: 'T',
          isAnonymous: false,
        }))
      )
      .onConflictDoNothing();
    await db.delete(userAiSettings).where(eq(userAiSettings.userId, USER_ID));
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [USER_ID, OTHER_USER_ID]));
    await moduleRef.close();
  });

  it('returns null settings when no row is stored', async () => {
    expect(await repo.getSettings(USER_ID)).toEqual({
      preferredModel: null,
      preferredIntent: null,
      primaryProvider: null,
      ghostTextEnabled: true,
    });
  });

  it('upserts then reads the preferred model', async () => {
    await repo.patchSettings(USER_ID, {
      preferredModel: 'anthropic:claude-sonnet-4-20250514',
    });
    expect((await repo.getSettings(USER_ID)).preferredModel).toBe(
      'anthropic:claude-sonnet-4-20250514'
    );
    await repo.patchSettings(USER_ID, {
      preferredModel: 'openai:gpt-4o-mini',
    });
    expect((await repo.getSettings(USER_ID)).preferredModel).toBe(
      'openai:gpt-4o-mini'
    );
  });

  it('clears the preferred model with null', async () => {
    await repo.patchSettings(USER_ID, {
      preferredModel: 'openai:gpt-4o-mini',
    });
    await repo.patchSettings(USER_ID, { preferredModel: null });
    expect((await repo.getSettings(USER_ID)).preferredModel).toBeNull();
  });

  it('reads an unrecognized stored intent as null', async () => {
    await db
      .insert(userAiSettings)
      .values({ userId: USER_ID, preferredIntent: 'not-an-intent' })
      .onConflictDoUpdate({
        target: userAiSettings.userId,
        set: { preferredIntent: 'not-an-intent' },
      });
    expect((await repo.getSettings(USER_ID)).preferredIntent).toBeNull();
  });

  it('patches the intent without touching the preferred model', async () => {
    await repo.patchSettings(USER_ID, {
      preferredModel: 'openai:gpt-4o-mini',
    });
    const patch: Partial<UserAiSettings> = { preferredIntent: 'powerful' };
    Object.assign(patch, { preferredModel: undefined });
    await repo.patchSettings(USER_ID, patch);
    expect(await repo.getSettings(USER_ID)).toEqual({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'powerful',
      primaryProvider: null,
      ghostTextEnabled: true,
    });
  });

  it('stores and reads the ghost text preference', async () => {
    await repo.patchSettings(USER_ID, { ghostTextEnabled: false });
    expect((await repo.getSettings(USER_ID)).ghostTextEnabled).toBe(false);
    await repo.patchSettings(USER_ID, { ghostTextEnabled: true });
    expect((await repo.getSettings(USER_ID)).ghostTextEnabled).toBe(true);
  });

  it('a model patch leaves the ghost text preference untouched', async () => {
    await repo.patchSettings(USER_ID, {
      preferredIntent: 'balanced',
      primaryProvider: null,
      ghostTextEnabled: false,
    });
    await repo.patchSettings(USER_ID, {
      preferredModel: 'openai:gpt-4o-mini',
    });
    expect(await repo.getSettings(USER_ID)).toEqual({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'balanced',
      primaryProvider: null,
      ghostTextEnabled: false,
    });
  });

  it('stores and reads the primary provider, and reads a missing one as null', async () => {
    expect((await repo.getSettings(USER_ID)).primaryProvider).toBeNull();
    await repo.patchSettings(USER_ID, { primaryProvider: 'openai' });
    expect((await repo.getSettings(USER_ID)).primaryProvider).toBe('openai');
  });

  describe('clearBoundToUnheldProvider', () => {
    const BOUND_TO_OPENAI = {
      preferredModel: 'openai:gpt-6',
      preferredIntent: 'fast',
      primaryProvider: 'openai',
      ghostTextEnabled: false,
    } as const satisfies UserAiSettings;

    const holdKey = (userId: string, provider: ByokProvider) =>
      db.insert(userProviderKeys).values({
        userId,
        provider,
        ciphertext: 'ct',
        iv: 'iv',
        authTag: 'tag',
        keyPrefix: 'sk-x',
      });

    beforeEach(async () => {
      await db
        .delete(userProviderKeys)
        .where(inArray(userProviderKeys.userId, [USER_ID, OTHER_USER_ID]));
      await db.delete(userAiSettings).where(eq(userAiSettings.userId, USER_ID));
    });

    it('clears the primary provider and the model bound to a provider no key is stored for', async () => {
      await holdKey(USER_ID, 'anthropic');
      await holdKey(OTHER_USER_ID, 'openai');
      await repo.patchSettings(USER_ID, BOUND_TO_OPENAI);

      await repo.clearBoundToUnheldProvider(USER_ID, 'openai');

      expect(await repo.getSettings(USER_ID)).toEqual({
        ...BOUND_TO_OPENAI,
        preferredModel: null,
        primaryProvider: null,
      });
    });

    it('leaves them intact once a key for that provider is stored again', async () => {
      await holdKey(USER_ID, 'openai');
      await repo.patchSettings(USER_ID, BOUND_TO_OPENAI);

      await repo.clearBoundToUnheldProvider(USER_ID, 'openai');

      expect(await repo.getSettings(USER_ID)).toEqual(BOUND_TO_OPENAI);
    });

    it('clears only the setting bound to the provider', async () => {
      await repo.patchSettings(USER_ID, {
        ...BOUND_TO_OPENAI,
        primaryProvider: 'anthropic',
      });

      await repo.clearBoundToUnheldProvider(USER_ID, 'openai');

      expect(await repo.getSettings(USER_ID)).toEqual({
        ...BOUND_TO_OPENAI,
        preferredModel: null,
        primaryProvider: 'anthropic',
      });
    });

    it('leaves settings bound to another provider alone', async () => {
      const elsewhere = {
        ...BOUND_TO_OPENAI,
        preferredModel: 'openrouter:openai/gpt-oss-120b',
        primaryProvider: 'anthropic',
      } as const satisfies UserAiSettings;
      await repo.patchSettings(USER_ID, elsewhere);

      await repo.clearBoundToUnheldProvider(USER_ID, 'openai');

      expect(await repo.getSettings(USER_ID)).toEqual(elsewhere);
    });

    it('writes nothing for a caller with no stored settings', async () => {
      await repo.clearBoundToUnheldProvider(USER_ID, 'openai');

      expect(
        await db
          .select()
          .from(userAiSettings)
          .where(eq(userAiSettings.userId, USER_ID))
      ).toEqual([]);
    });
  });
});
