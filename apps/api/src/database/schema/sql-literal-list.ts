import { sql, type SQL } from 'drizzle-orm';

/** sql.raw does not escape: only compile-time literal arrays, never runtime-derived strings. */
export function sqlLiteralList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}
