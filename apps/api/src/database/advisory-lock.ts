import type { Sql } from 'postgres';

export type AdvisoryLockOutcome<T> =
  | { acquired: true; result: T }
  | { acquired: false; result: null };

/**
 * Runs `work` under a session-level advisory lock, resolving `acquired: false` without running it when another holder has the lock.
 * Pinned to a reserved connection: unlocking through the pool can hit a session that never held it, stranding the lock forever.
 */
export async function runWithAdvisoryLock<T>(
  client: Sql,
  key: number,
  work: () => Promise<T>
): Promise<AdvisoryLockOutcome<T>> {
  const reserved = await client.reserve();
  try {
    const [row] = await reserved<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(${key}) AS locked`;
    if (row?.locked !== true) {
      return { acquired: false, result: null };
    }
    try {
      return { acquired: true, result: await work() };
    } finally {
      await reserved`SELECT pg_advisory_unlock(${key})`;
    }
  } finally {
    reserved.release();
  }
}
