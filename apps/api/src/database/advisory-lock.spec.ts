import type { Sql } from 'postgres';
import { describe, expect, it, vi } from 'vitest';

import { runWithAdvisoryLock } from './advisory-lock';

const LOCK_KEY = 778_493_999;

function makeClient(locked: boolean) {
  const queries: string[] = [];
  const release = vi.fn();
  const reserved = Object.assign(
    (strings: TemplateStringsArray) => {
      const text = strings.join('?');
      queries.push(text);
      return Promise.resolve(
        text.includes('pg_try_advisory_lock') ? [{ locked }] : []
      );
    },
    { release }
  );
  const reserve = vi.fn().mockResolvedValue(reserved);
  return { client: { reserve } as unknown as Sql, queries, release, reserve };
}

describe('runWithAdvisoryLock', () => {
  it('runs the work and unlocks on the reserved connection', async () => {
    const { client, queries, release } = makeClient(true);
    const work = vi.fn().mockResolvedValue(undefined);

    await expect(runWithAdvisoryLock(client, LOCK_KEY, work)).resolves.toBe(
      true
    );

    expect(work).toHaveBeenCalledTimes(1);
    expect(queries[0]).toContain('pg_try_advisory_lock');
    expect(queries[1]).toContain('pg_advisory_unlock');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('skips the work and never unlocks when another holder has the lock', async () => {
    const { client, queries, release } = makeClient(false);
    const work = vi.fn();

    await expect(runWithAdvisoryLock(client, LOCK_KEY, work)).resolves.toBe(
      false
    );

    expect(work).not.toHaveBeenCalled();
    expect(queries.some((q) => q.includes('pg_advisory_unlock'))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('unlocks and releases when the work throws, then propagates', async () => {
    const { client, queries, release } = makeClient(true);
    const boom = new Error('work failed');

    await expect(
      runWithAdvisoryLock(client, LOCK_KEY, () => Promise.reject(boom))
    ).rejects.toBe(boom);

    expect(queries[1]).toContain('pg_advisory_unlock');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('takes the lock and releases it on the same reserved connection', async () => {
    const { client, reserve } = makeClient(true);

    await runWithAdvisoryLock(client, LOCK_KEY, () => Promise.resolve());

    expect(reserve).toHaveBeenCalledTimes(1);
  });
});
