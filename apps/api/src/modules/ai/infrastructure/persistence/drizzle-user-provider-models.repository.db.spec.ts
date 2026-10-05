import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ByokProvider } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  userProviderKeys,
  userProviderModels,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleUserProviderKeysRepository } from './drizzle-user-provider-keys.repository';
import { DrizzleUserProviderModelsRepository } from './drizzle-user-provider-models.repository';

const USER_ID = '00000000-0000-4000-8000-0000000000cc';
const OLD_FP = 'a'.repeat(64);
const NEW_FP = 'b'.repeat(64);
const DAY_MS = 24 * 60 * 60 * 1000;
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000cd';
const FOREIGN_KEY_VIOLATION = '23503';

describe.runIf(DB_AVAILABLE)('DrizzleUserProviderModelsRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let keysRepo: DrizzleUserProviderKeysRepository;
  let repo: DrizzleUserProviderModelsRepository;

  const seedKey = (provider: ByokProvider, userId: string = USER_ID) =>
    keysRepo.upsert(
      userId,
      provider,
      { ciphertext: 'ct', iv: 'iv', authTag: 'tag' },
      'sk-x'
    );

  const listing = (
    provider: ByokProvider,
    keyFingerprint: string,
    modelIds: string[],
    syncedAt: Date = new Date()
  ) => ({ provider, keyFingerprint, modelIds, syncedAt });

  const setKeyUpdatedAt = (provider: ByokProvider, at: Date) =>
    db
      .update(userProviderKeys)
      .set({ updatedAt: at })
      .where(
        and(
          eq(userProviderKeys.userId, USER_ID),
          eq(userProviderKeys.provider, provider)
        )
      );

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
    keysRepo = new DrizzleUserProviderKeysRepository(db);
    repo = new DrizzleUserProviderModelsRepository(db);

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
  });

  beforeEach(async () => {
    await db
      .delete(userProviderKeys)
      .where(inArray(userProviderKeys.userId, [USER_ID, OTHER_USER_ID]));
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [USER_ID, OTHER_USER_ID]));
    await moduleRef.close();
  });

  it('saves and reads a listing', async () => {
    await seedKey('anthropic');
    const saved = listing('anthropic', OLD_FP, ['m1', 'm2']);
    await repo.save(USER_ID, saved);

    expect(await repo.get(USER_ID, 'anthropic')).toEqual(saved);
    expect(await repo.get(USER_ID, 'openai')).toBeNull();
  });

  it('lists every listing of a user', async () => {
    await seedKey('anthropic');
    await seedKey('openai');
    await seedKey('anthropic', OTHER_USER_ID);
    const anthropic = listing('anthropic', OLD_FP, ['m1']);
    const openai = listing('openai', NEW_FP, ['m2', 'm3']);
    await repo.save(USER_ID, openai);
    await repo.save(USER_ID, anthropic);
    await repo.save(OTHER_USER_ID, listing('anthropic', NEW_FP, ['m4']));
    await db
      .update(userProviderModels)
      .set({ syncedAt: null })
      .where(
        and(
          eq(userProviderModels.userId, USER_ID),
          eq(userProviderModels.provider, 'openai')
        )
      );

    expect(await repo.listForUser(USER_ID)).toEqual([
      anthropic,
      { ...openai, syncedAt: null },
    ]);
  });

  it('save replaces the listing of a previous key', async () => {
    await seedKey('anthropic');
    await repo.save(USER_ID, listing('anthropic', OLD_FP, ['m1']));
    const next = listing('anthropic', NEW_FP, ['m2', 'm3']);
    await repo.save(USER_ID, next);

    expect(await repo.get(USER_ID, 'anthropic')).toEqual(next);
  });

  it('replace writes over the row it read', async () => {
    await seedKey('anthropic');
    await repo.save(USER_ID, listing('anthropic', OLD_FP, ['m1']));
    const next = listing('anthropic', OLD_FP, ['m1', 'm2']);

    expect(await repo.replace(USER_ID, next, OLD_FP)).toBe(true);
    expect(await repo.get(USER_ID, 'anthropic')).toEqual(next);
  });

  it('leaves a listing written for a newer key untouched', async () => {
    await seedKey('anthropic');
    await repo.save(USER_ID, listing('anthropic', NEW_FP, ['new']));

    expect(
      await repo.replace(USER_ID, listing('anthropic', OLD_FP, ['old']), OLD_FP)
    ).toBe(false);
    expect(await repo.get(USER_ID, 'anthropic')).toMatchObject({
      keyFingerprint: NEW_FP,
      modelIds: ['new'],
    });
  });

  it('replace inserts when no row existed, and yields to one written meanwhile', async () => {
    await seedKey('anthropic');
    const inserted = listing('anthropic', OLD_FP, ['m1']);

    expect(await repo.replace(USER_ID, inserted, null)).toBe(true);
    expect(await repo.get(USER_ID, 'anthropic')).toEqual(inserted);

    expect(
      await repo.replace(USER_ID, listing('anthropic', NEW_FP, ['m2']), null)
    ).toBe(false);
    expect(await repo.get(USER_ID, 'anthropic')).toEqual(inserted);
  });

  it('rejects a listing for a key that was deleted meanwhile', async () => {
    await expect(
      repo.replace(USER_ID, listing('anthropic', OLD_FP, ['m1']), null)
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: FOREIGN_KEY_VIOLATION,
        constraint_name: 'user_provider_models_key_fk',
      }),
    });
  });

  it('marks a listing stale and keeps it', async () => {
    await seedKey('anthropic');
    await seedKey('openai');
    await seedKey('anthropic', OTHER_USER_ID);
    const anthropic = listing('anthropic', OLD_FP, ['m1', 'm2']);
    const openai = listing('openai', OLD_FP, ['m3']);
    const otherUser = listing('anthropic', NEW_FP, ['m4']);
    await repo.save(USER_ID, anthropic);
    await repo.save(USER_ID, openai);
    await repo.save(OTHER_USER_ID, otherUser);

    await repo.markStale(USER_ID, 'anthropic');

    expect(await repo.get(USER_ID, 'anthropic')).toEqual({
      ...anthropic,
      syncedAt: null,
    });
    expect(await repo.get(USER_ID, 'openai')).toEqual(openai);
    expect(await repo.get(OTHER_USER_ID, 'anthropic')).toEqual(otherUser);
  });

  it('finds a stale listing due', async () => {
    const now = Date.now();
    const cut = new Date(now - DAY_MS);
    await seedKey('anthropic');
    await setKeyUpdatedAt('anthropic', new Date(now - 10 * DAY_MS));
    await repo.save(
      USER_ID,
      listing('anthropic', OLD_FP, ['m1'], new Date(now))
    );
    const dueOfUser = async () =>
      (await repo.findDue(cut, 100, null)).filter((k) => k.userId === USER_ID);

    expect(await dueOfUser()).toEqual([]);

    await repo.markStale(USER_ID, 'anthropic');

    expect(await dueOfUser()).toEqual([
      { userId: USER_ID, provider: 'anthropic' },
    ]);
  });

  it('deletes the listing with its key', async () => {
    await seedKey('anthropic');
    await repo.save(USER_ID, listing('anthropic', OLD_FP, ['m1']));
    await keysRepo.remove(USER_ID, 'anthropic');

    expect(await repo.get(USER_ID, 'anthropic')).toBeNull();
  });

  it('finds keys with no listing, stale, older than the cut, or older than their key', async () => {
    const now = Date.now();
    const cut = new Date(now - DAY_MS);
    await seedKey('anthropic');
    await seedKey('openai');
    await seedKey('openrouter');
    await seedKey('google');
    await seedKey('anthropic', OTHER_USER_ID);
    await db
      .update(userProviderKeys)
      .set({ updatedAt: new Date(now - 10 * DAY_MS) })
      .where(eq(userProviderKeys.userId, OTHER_USER_ID));
    await setKeyUpdatedAt('openai', new Date(now - 10 * DAY_MS));
    await setKeyUpdatedAt('openrouter', new Date(now - 10 * DAY_MS));
    await setKeyUpdatedAt('google', new Date(now - 10 * DAY_MS));

    await repo.save(USER_ID, listing('openai', OLD_FP, [], new Date(now)));
    await db
      .update(userProviderModels)
      .set({ syncedAt: null })
      .where(
        and(
          eq(userProviderModels.userId, USER_ID),
          eq(userProviderModels.provider, 'openai')
        )
      );
    await repo.save(
      USER_ID,
      listing('openrouter', OLD_FP, [], new Date(now - 2 * DAY_MS))
    );
    await repo.save(USER_ID, listing('google', OLD_FP, [], new Date(now)));
    await setKeyUpdatedAt('google', new Date(now + 60_000));
    await repo.save(
      OTHER_USER_ID,
      listing('anthropic', OLD_FP, [], new Date(now))
    );

    const due = (await repo.findDue(cut, 100, null)).filter((k) =>
      [USER_ID, OTHER_USER_ID].includes(k.userId)
    );

    expect(due).toEqual([
      { userId: USER_ID, provider: 'anthropic' },
      { userId: USER_ID, provider: 'google' },
      { userId: USER_ID, provider: 'openai' },
      { userId: USER_ID, provider: 'openrouter' },
    ]);
  });

  it('pages due keys after the cursor', async () => {
    await seedKey('anthropic');
    await seedKey('openai');
    await seedKey('openrouter');
    const cut = new Date();

    const all = (await repo.findDue(cut, 100, null)).filter(
      (k) => k.userId === USER_ID
    );
    expect(all.map((k) => k.provider)).toEqual([
      'anthropic',
      'openai',
      'openrouter',
    ]);

    const firstPage = await repo.findDue(cut, 1, {
      userId: USER_ID,
      provider: 'anthropic',
    });
    expect(firstPage).toEqual([{ userId: USER_ID, provider: 'openai' }]);
  });

  it("pages from one user's last due key to the next user's first", async () => {
    await seedKey('openrouter');
    await seedKey('anthropic', OTHER_USER_ID);
    await seedKey('openai', OTHER_USER_ID);

    const nextPage = await repo.findDue(new Date(), 1, {
      userId: USER_ID,
      provider: 'openrouter',
    });

    expect(nextPage).toEqual([
      { userId: OTHER_USER_ID, provider: 'anthropic' },
    ]);
  });
});
