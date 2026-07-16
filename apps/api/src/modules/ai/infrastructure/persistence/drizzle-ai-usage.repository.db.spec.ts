import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  aiUsage,
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../database';
import { DrizzleAIUsageRepository } from './drizzle-ai-usage.repository';

const DB_USER_ID = '00000000-0000-4000-8000-0000000000d7';

loadEnv({ path: ['.env.local', '.env'] });
const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();

describe.runIf(DB_AVAILABLE)('DrizzleAIUsageRepository (database)', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleAIUsageRepository;

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
    repo = new DrizzleAIUsageRepository(db);

    await db
      .insert(users)
      .values({
        id: DB_USER_ID,
        email: `e-${DB_USER_ID}@test.local`,
        name: 'Usage Actor',
        isAnonymous: false,
      })
      .onConflictDoNothing();
    await db.delete(aiUsage).where(eq(aiUsage.userId, DB_USER_ID));
  });

  afterEach(async () => {
    await db.delete(aiUsage).where(eq(aiUsage.userId, DB_USER_ID));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, DB_USER_ID));
    await moduleRef.close();
  });

  it('aggregates metrics per model alongside the per-action breakdown', async () => {
    await repo.recordUsage({
      userId: DB_USER_ID,
      action: 'agent',
      model: 'claude-sonnet-5',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
    });
    await repo.recordUsage({
      userId: DB_USER_ID,
      action: 'ghost-text',
      model: 'claude-sonnet-5',
      inputTokens: 20,
      outputTokens: 10,
      costUsd: 0.002,
    });
    await repo.recordUsage({
      userId: DB_USER_ID,
      action: 'agent',
      model: 'claude-haiku-4-5',
      inputTokens: 40,
      outputTokens: 20,
      costUsd: 0.001,
    });

    const summary = await repo.getMetricsSummary(DB_USER_ID, 'day');

    expect(summary.byModel['claude-sonnet-5']).toEqual({
      requests: 2,
      tokens: 180,
      costUsd: expect.closeTo(0.012, 6),
    });
    expect(summary.byModel['claude-haiku-4-5']).toEqual({
      requests: 1,
      tokens: 60,
      costUsd: expect.closeTo(0.001, 6),
    });
  });

  it('returns an empty byModel map when there is no activity', async () => {
    const summary = await repo.getMetricsSummary(DB_USER_ID, 'day');
    expect(summary.byModel).toEqual({});
  });
});
