import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  userProviderKeys,
  users,
  type Database,
} from '../../../../database';
import { DrizzleUserProviderKeysRepository } from './drizzle-user-provider-keys.repository';

const USER_ID = '00000000-0000-4000-8000-0000000000c4';

loadEnv({ path: ['.env.local', '.env'] });
const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();

describe.runIf(DB_AVAILABLE)('DrizzleUserProviderKeysRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleUserProviderKeysRepository;

  const seedAnthropic = () =>
    repo.upsert(
      USER_ID,
      'anthropic',
      { ciphertext: 'ct', iv: 'iv', authTag: 'tag' },
      'sk-ant-x'
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
    repo = new DrizzleUserProviderKeysRepository(db);

    await db
      .insert(users)
      .values({
        id: USER_ID,
        email: `e-${USER_ID}@test.local`,
        name: 'T',
        isAnonymous: false,
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db
      .delete(userProviderKeys)
      .where(eq(userProviderKeys.userId, USER_ID));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER_ID));
    await moduleRef.close();
  });

  it('upserts, lists (masked), reads encrypted, reports enabled providers', async () => {
    await seedAnthropic();
    const list = await repo.listForUser(USER_ID);
    expect(list).toEqual([
      expect.objectContaining({ provider: 'anthropic', keyPrefix: 'sk-ant-x' }),
    ]);
    expect(await repo.getEnabledProviders(USER_ID)).toEqual(['anthropic']);
    expect(await repo.getEncrypted(USER_ID, 'anthropic')).toMatchObject({
      ciphertext: 'ct',
      iv: 'iv',
      authTag: 'tag',
    });
  });

  it('upsert replaces the same provider row', async () => {
    await seedAnthropic();
    await repo.upsert(
      USER_ID,
      'anthropic',
      { ciphertext: 'ct2', iv: 'iv2', authTag: 'tag2' },
      'sk-ant-y'
    );
    expect(await repo.listForUser(USER_ID)).toHaveLength(1);
  });

  it('touchLastUsed stamps lastUsedAt', async () => {
    await seedAnthropic();
    await repo.touchLastUsed(USER_ID, 'anthropic');
    const list = await repo.listForUser(USER_ID);
    expect(list[0].lastUsedAt).not.toBeNull();
  });

  it('remove deletes the row', async () => {
    await seedAnthropic();
    await repo.remove(USER_ID, 'anthropic');
    expect(await repo.getEncrypted(USER_ID, 'anthropic')).toBeNull();
    expect(await repo.getEnabledProviders(USER_ID)).toEqual([]);
  });

  it('getEncrypted returns null for a provider with no stored key', async () => {
    expect(await repo.getEncrypted(USER_ID, 'openai')).toBeNull();
  });

  it('remove is idempotent when the provider has no stored key', async () => {
    await expect(repo.remove(USER_ID, 'openai')).resolves.toBeUndefined();
  });

  it('touchLastUsed is a no-op when no row exists', async () => {
    await expect(
      repo.touchLastUsed(USER_ID, 'openai')
    ).resolves.toBeUndefined();
    expect(await repo.listForUser(USER_ID)).toEqual([]);
  });
});
