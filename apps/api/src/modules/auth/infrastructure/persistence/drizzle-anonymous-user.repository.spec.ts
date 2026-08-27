import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../../database';
import { DrizzleAnonymousUserRepository } from './drizzle-anonymous-user.repository';

const CREATED_BEFORE = new Date('2026-07-27T03:00:00.000Z');
const SESSIONS_LIVE_AT = new Date('2026-08-26T03:00:00.000Z');

function createMockDb(rows: { id: string }[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const del = vi.fn().mockReturnValue({ where });
  return { db: { delete: del } as unknown as Database, where };
}

function renderDeletePredicate(where: ReturnType<typeof vi.fn>): string {
  const condition = where.mock.calls[0]?.[0] as SQL;
  return new PgDialect().sqlToQuery(condition).sql;
}

describe('DrizzleAnonymousUserRepository', () => {
  it('spares anonymous users that still hold an unexpired session', async () => {
    const { db, where } = createMockDb([]);

    await new DrizzleAnonymousUserRepository(db).deleteAbandoned(
      CREATED_BEFORE,
      SESSIONS_LIVE_AT
    );

    const sql = renderDeletePredicate(where);
    expect(sql).toContain('not exists');
    expect(sql).toContain('"sessions"."user_id" = "users"."id"');
    expect(sql).toContain('"sessions"."expires_at" >');
  });

  it('only targets anonymous users created before the cutoff', async () => {
    const { db, where } = createMockDb([]);

    await new DrizzleAnonymousUserRepository(db).deleteAbandoned(
      CREATED_BEFORE,
      SESSIONS_LIVE_AT
    );

    const sql = renderDeletePredicate(where);
    expect(sql).toContain('"users"."is_anonymous" =');
    expect(sql).toContain('"users"."created_at" <');
  });

  it('returns how many rows it deleted', async () => {
    const { db } = createMockDb([{ id: 'u1' }, { id: 'u2' }]);

    await expect(
      new DrizzleAnonymousUserRepository(db).deleteAbandoned(
        CREATED_BEFORE,
        SESSIONS_LIVE_AT
      )
    ).resolves.toBe(2);
  });
});
