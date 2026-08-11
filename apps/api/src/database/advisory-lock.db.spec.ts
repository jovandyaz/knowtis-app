import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import { DB_AVAILABLE } from '../test-support/database';
import { runWithAdvisoryLock } from './advisory-lock';

const KEY = 778_493_777;
const client = postgres(process.env['DATABASE_URL'] ?? '', { max: 5 });

async function heldCount(): Promise<number> {
  const [row] = await client<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND objid = ${KEY}`;
  return row.n;
}

describe.runIf(DB_AVAILABLE)('runWithAdvisoryLock against Postgres', () => {
  afterAll(async () => {
    await client.end();
  });

  it('holds the lock during the work and releases it after', async () => {
    expect(await heldCount()).toBe(0);
    let during = -1;

    await expect(
      runWithAdvisoryLock(client, KEY, async () => {
        during = await heldCount();
      })
    ).resolves.toBe(true);

    expect(during).toBe(1);
    expect(await heldCount()).toBe(0);
  });

  it('refuses a second holder while the first still runs', async () => {
    let second: boolean | null = null;

    await runWithAdvisoryLock(client, KEY, async () => {
      second = await runWithAdvisoryLock(client, KEY, () =>
        Promise.reject(new Error('must not run'))
      );
    });

    expect(second).toBe(false);
  });

  it('releases the lock when the work throws', async () => {
    await expect(
      runWithAdvisoryLock(client, KEY, () => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom');

    expect(await heldCount()).toBe(0);
  });
});
