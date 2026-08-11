import type { Sql } from 'postgres';

/**
 * Runs `work` under a session-level advisory lock, resolving `false` without running it when another holder has the lock.
 * Pinned to a reserved connection: unlocking through the pool can hit a session that never held it, stranding the lock forever.
 */
export async function runWithAdvisoryLock(
  client: Sql,
  key: number,
  work: () => Promise<void>
): Promise<boolean> {
  const reserved = await client.reserve();
  try {
    const [row] = await reserved<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(${key}) AS locked`;
    if (row?.locked !== true) {
      return false;
    }
    try {
      await work();
    } finally {
      await reserved`SELECT pg_advisory_unlock(${key})`;
    }
    return true;
  } finally {
    reserved.release();
  }
}
