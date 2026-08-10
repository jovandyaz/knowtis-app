import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../../config/env.config';
import {
  adminAuditLog,
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../../database';
import { DB_AVAILABLE } from '../../../../../test-support/database';
import { DrizzleAdminAuditRepository } from './drizzle-admin-audit.repository';

const DB_USER_ID = '00000000-0000-4000-8000-0000000000a1';

describe.runIf(DB_AVAILABLE)('DrizzleAdminAuditRepository (database)', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleAdminAuditRepository;

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
    repo = new DrizzleAdminAuditRepository(db);

    await db
      .insert(users)
      .values({
        id: DB_USER_ID,
        email: `e-${DB_USER_ID}@test.local`,
        name: 'Audit Actor',
        isAnonymous: false,
      })
      .onConflictDoNothing();
    await db.delete(adminAuditLog).where(eq(adminAuditLog.actorId, DB_USER_ID));
  });

  afterEach(async () => {
    await db.delete(adminAuditLog).where(eq(adminAuditLog.actorId, DB_USER_ID));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, DB_USER_ID));
    await moduleRef.close();
  });

  it('records an entry and returns it newest-first with the actor email joined', async () => {
    await repo.insert({
      actorId: DB_USER_ID,
      action: 'user.role.updated',
      targetType: 'user',
      targetId: 'target-older',
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.insert({
      actorId: DB_USER_ID,
      action: 'user.role.updated',
      targetType: 'user',
      targetId: 'target-newer',
    });

    const page = await repo.findPaginated({ page: 1, limit: 1000 });
    const ours = page.items.filter((item) => item.actorId === DB_USER_ID);

    expect(ours).toHaveLength(2);
    expect(ours[0].targetId).toBe('target-newer');
    expect(ours[1].targetId).toBe('target-older');
    expect(ours[0].actorEmail).toBe(`e-${DB_USER_ID}@test.local`);
  });

  it('respects limit and page while returning the exact total count', async () => {
    const baseline = await repo.findPaginated({ page: 1, limit: 1 });
    const insertedCount = 3;

    for (const targetId of ['t1', 't2', 't3']) {
      await repo.insert({
        actorId: DB_USER_ID,
        action: 'user.role.updated',
        targetType: 'user',
        targetId,
      });
    }

    const total = baseline.total + insertedCount;
    const pageOne = await repo.findPaginated({ page: 1, limit: 2 });
    const pageTwo = await repo.findPaginated({ page: 2, limit: 2 });

    expect(pageOne.total).toBe(total);
    expect(pageTwo.total).toBe(total);
    expect(pageOne.items).toHaveLength(Math.min(2, total));
    expect(pageTwo.items).toHaveLength(Math.max(0, Math.min(2, total - 2)));
  });

  it('returns an empty page with the exact total when the page is out of range', async () => {
    await repo.insert({
      actorId: DB_USER_ID,
      action: 'user.role.updated',
      targetType: 'user',
      targetId: 'only-entry',
    });

    const baseline = await repo.findPaginated({ page: 1, limit: 1 });
    const outOfRange = await repo.findPaginated({ page: 100000, limit: 100 });

    expect(outOfRange.items).toHaveLength(0);
    expect(outOfRange.total).toBe(baseline.total);
    expect(outOfRange.total).toBeGreaterThanOrEqual(1);
  });

  it('rejects an insert whose actorId does not reference an existing user', async () => {
    await expect(
      repo.insert({
        actorId: '00000000-0000-4000-8000-00000000dead',
        action: 'user.role.updated',
        targetType: 'user',
        targetId: 'orphan',
      })
    ).rejects.toThrow();
  });

  it('round-trips before/after jsonb payloads and defaults omitted payloads to null', async () => {
    await repo.insert({
      actorId: DB_USER_ID,
      action: 'feature_flag.updated',
      targetType: 'feature_flag',
      targetId: 'ai_enabled',
      before: { enabled: false, nested: { count: 1 } },
      after: { enabled: true, nested: { count: 1 } },
    });
    await repo.insert({
      actorId: DB_USER_ID,
      action: 'feature_flag.created',
      targetType: 'feature_flag',
    });

    const page = await repo.findPaginated({ page: 1, limit: 1000 });
    const withPayload = page.items.find(
      (item) => item.targetId === 'ai_enabled'
    );
    const withoutPayload = page.items.find(
      (item) => item.action === 'feature_flag.created' && item.targetId === null
    );

    expect(withPayload?.before).toEqual({
      enabled: false,
      nested: { count: 1 },
    });
    expect(withPayload?.after).toEqual({
      enabled: true,
      nested: { count: 1 },
    });
    expect(withoutPayload?.before).toBeNull();
    expect(withoutPayload?.after).toBeNull();
  });
});
