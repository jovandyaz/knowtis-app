import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DB_AVAILABLE } from '../test-support/database';
import { isLockTimeout } from './migration-retry';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';

const blocker = postgres(DATABASE_URL, { max: 1 });
const victim = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(victim);

describe.runIf(DB_AVAILABLE)('isLockTimeout against Postgres', () => {
  beforeAll(async () => {
    await blocker`CREATE TABLE IF NOT EXISTS migration_retry_probe (id int)`;
  });

  afterAll(async () => {
    await blocker`DROP TABLE IF EXISTS migration_retry_probe`;
    await blocker.end();
    await victim.end();
  });

  it('classifies the error drizzle raises when an ALTER waits on a held lock', async () => {
    let release: () => void = () => undefined;
    let confirmHeld: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = new Promise<void>((resolve) => {
      confirmHeld = resolve;
    });
    const holding = blocker.begin(async (tx) => {
      await tx`LOCK TABLE migration_retry_probe IN ACCESS EXCLUSIVE MODE`;
      confirmHeld();
      await released;
    });
    await held;

    await db.execute(sql`SET lock_timeout = '1s'`);
    let raised: unknown;
    try {
      // A transaction, because that is how drizzle's migrator applies each file.
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`ALTER TABLE migration_retry_probe ADD COLUMN probe int`
        );
      });
    } catch (error) {
      raised = error;
    } finally {
      release();
      await holding;
    }

    expect(raised).toBeInstanceOf(Error);
    expect(isLockTimeout(raised)).toBe(true);
  });
});
