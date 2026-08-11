import type { Sql } from 'postgres';
import { vi } from 'vitest';

/** A postgres-js client whose reserved connection answers `pg_try_advisory_lock` with `locked`. */
export function createAdvisoryLockClient(locked = true): Sql {
  const reserved = Object.assign(
    (strings: TemplateStringsArray) =>
      Promise.resolve(
        strings.join('?').includes('pg_try_advisory_lock') ? [{ locked }] : []
      ),
    { release: vi.fn() }
  );
  return { reserve: vi.fn().mockResolvedValue(reserved) } as unknown as Sql;
}
