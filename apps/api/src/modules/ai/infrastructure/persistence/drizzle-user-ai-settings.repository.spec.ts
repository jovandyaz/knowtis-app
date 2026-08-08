import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  userAiSettings,
  users,
  type Database,
} from '../../../../database';
import type { UserAiSettings } from '../../domain/ports/user-ai-settings.repository';
import { DrizzleUserAiSettingsRepository } from './drizzle-user-ai-settings.repository';

const USER_ID = '00000000-0000-4000-8000-0000000000c3';

loadEnv({ path: ['.env.local', '.env'] });
const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();

describe.runIf(DB_AVAILABLE)('DrizzleUserAiSettingsRepository', () => {
  let db: Database;
  let repo: DrizzleUserAiSettingsRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
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
      .values({
        id: USER_ID,
        email: `e-${USER_ID}@test.local`,
        name: 'T',
        isAnonymous: false,
      })
      .onConflictDoNothing();
    await db.delete(userAiSettings).where(eq(userAiSettings.userId, USER_ID));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER_ID));
  });

  it('returns null settings when no row is stored', async () => {
    expect(await repo.getSettings(USER_ID)).toEqual({
      preferredModel: null,
      preferredIntent: null,
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
    });
  });
});
