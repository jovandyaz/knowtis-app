import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  aiUsage,
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleAIUsageRepository } from './drizzle-ai-usage.repository';

const DB_USER_ID = '00000000-0000-4000-8000-0000000000c5';

describe('DrizzleAIUsageRepository', () => {
  let repo: DrizzleAIUsageRepository;
  let mockDb: Database;

  beforeEach(() => {
    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalInputTokens: 500,
              totalOutputTokens: 200,
              totalCostUsd: '0.003450',
              requestCount: 3,
            },
          ]),
        }),
      }),
    } as unknown as Database;

    repo = new DrizzleAIUsageRepository(mockDb);
  });

  describe('recordUsage', () => {
    it('should insert usage record with correctly formatted cost', async () => {
      await repo.recordUsage({
        userId: 'user-123',
        action: AI_ACTION.SUMMARIZE,
        model: 'anthropic:claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.00105,
      });

      expect(mockDb.insert).toHaveBeenCalled();
      const insertChain = vi.mocked(mockDb.insert).mock.results[0]?.value as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertChain.values).toHaveBeenCalledWith({
        userId: 'user-123',
        action: AI_ACTION.SUMMARIZE,
        model: 'anthropic:claude-sonnet-4-20250514',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: '0.001050',
        byok: false,
      });
    });
  });

  describe('getDailyUsage', () => {
    it('should return parsed numeric values from aggregation', async () => {
      const result = await repo.getDailyUsage('user-123');

      expect(result).toEqual({
        totalInputTokens: 500,
        totalOutputTokens: 200,
        totalCostUsd: 0.00345,
        requestCount: 3,
      });
    });

    it('should return zeros when no rows match', async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }) as unknown as Database['select'];

      const result = await repo.getDailyUsage('user-999');

      expect(result).toEqual({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
      });
    });

    it('should return zeros when row has null values', async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalInputTokens: null,
              totalOutputTokens: null,
              totalCostUsd: null,
              requestCount: null,
            },
          ]),
        }),
      }) as unknown as Database['select'];

      const result = await repo.getDailyUsage('user-123');

      expect(result).toEqual({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
      });
    });
  });
});

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
        name: 'U',
        isAnonymous: false,
      })
      .onConflictDoNothing();
    await db.delete(aiUsage).where(eq(aiUsage.userId, DB_USER_ID));
  });

  afterAll(async () => {
    await db.delete(aiUsage).where(eq(aiUsage.userId, DB_USER_ID));
    await db.delete(users).where(eq(users.id, DB_USER_ID));
    await moduleRef.close();
  });

  it('excludes byok usage from the daily budget total', async () => {
    await repo.recordUsage({
      userId: DB_USER_ID,
      action: AI_ACTION.SUMMARIZE,
      model: 'anthropic:claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.5,
      byok: false,
    });
    await repo.recordUsage({
      userId: DB_USER_ID,
      action: AI_ACTION.SUMMARIZE,
      model: 'google:gemini-2.0-flash',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 9.0,
      byok: true,
    });

    const usage = await repo.getDailyUsage(DB_USER_ID);
    expect(usage.totalCostUsd).toBe(0.5);
  });
});
