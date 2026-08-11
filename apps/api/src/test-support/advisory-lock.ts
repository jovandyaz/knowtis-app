import type { Sql } from 'postgres';
import { vi } from 'vitest';

export interface AdvisoryLockClientStub {
  client: Sql;
  queries: string[];
  reserve: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

/** A postgres-js client whose reserved connection answers `pg_try_advisory_lock` with `locked`, recording every statement it was sent. */
export function createAdvisoryLockClient(
  locked = true
): AdvisoryLockClientStub {
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
  return { client: { reserve } as unknown as Sql, queries, reserve, release };
}
