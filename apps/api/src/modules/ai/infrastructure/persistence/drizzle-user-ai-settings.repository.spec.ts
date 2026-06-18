import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../database';
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
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER_ID));
  });

  it('returns null when no preference is stored', async () => {
    expect(await repo.getPreferredModel(USER_ID)).toBeNull();
  });

  it('upserts then reads the preferred model', async () => {
    await repo.setPreferredModel(USER_ID, 'anthropic:claude-sonnet-4-20250514');
    expect(await repo.getPreferredModel(USER_ID)).toBe(
      'anthropic:claude-sonnet-4-20250514'
    );
    await repo.setPreferredModel(USER_ID, 'openai:gpt-4o-mini');
    expect(await repo.getPreferredModel(USER_ID)).toBe('openai:gpt-4o-mini');
  });

  it('clears the preference with null', async () => {
    await repo.setPreferredModel(USER_ID, 'openai:gpt-4o-mini');
    await repo.setPreferredModel(USER_ID, null);
    expect(await repo.getPreferredModel(USER_ID)).toBeNull();
  });
});
