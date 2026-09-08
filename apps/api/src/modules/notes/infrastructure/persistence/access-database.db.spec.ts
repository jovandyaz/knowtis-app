import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';

import { AccessDatabase } from './access-database';

let pool: AccessDatabase | undefined;
afterEach(async () => {
  await pool?.onModuleDestroy();
});
describe('dedicated access authority database', () => {
  it('pins statement timeout and primary selection despite URL session overrides, including reconnect', async () => {
    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }
    const url = new URL(databaseUrl);
    url.searchParams.set('statement_timeout', '0');
    url.searchParams.set('options', '-c statement_timeout=0');
    pool = new AccessDatabase(
      new ConfigService({ DATABASE_URL: url.toString() })
    );
    const first = await pool.client`show statement_timeout`;
    expect(first[0]?.['statement_timeout']).toBe('900ms');
    const started = performance.now();
    await expect(pool.client`select pg_sleep(2)`).rejects.toMatchObject({
      code: '57014',
    });
    expect(performance.now() - started).toBeLessThan(1300);
    expect(pool.client.options.max).toBe(2);
    await expect(
      pool.client`select pg_terminate_backend(pg_backend_pid())`
    ).rejects.toBeDefined();
    expect(
      (await pool.client`show statement_timeout`)[0]?.['statement_timeout']
    ).toBe('900ms');
  });
});
