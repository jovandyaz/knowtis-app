import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { AI_PROVIDERS, BYOK_PROVIDERS } from '@knowtis/shared-types';

import { systemProviderKeys } from './system-provider-keys.schema';
import { userProviderKeys } from './user-provider-keys.schema';

function checkSql(
  table: typeof systemProviderKeys | typeof userProviderKeys,
  name: string
): string {
  const check = getTableConfig(table).checks.find((c) => c.name === name);
  if (!check) {
    throw new Error(`missing check ${name}`);
  }
  return new PgDialect().sqlToQuery(check.value).sql;
}

describe('provider CHECK constraints', () => {
  it('system_provider_keys accepts exactly AI_PROVIDERS', () => {
    const sqlText = checkSql(
      systemProviderKeys,
      'system_provider_keys_provider_check'
    );
    for (const provider of AI_PROVIDERS) {
      expect(sqlText).toContain(`'${provider}'`);
    }
    expect(sqlText.match(/'/g)?.length).toBe(AI_PROVIDERS.length * 2);
  });

  it('user_provider_keys accepts exactly BYOK_PROVIDERS', () => {
    const sqlText = checkSql(
      userProviderKeys,
      'user_provider_keys_provider_check'
    );
    for (const provider of BYOK_PROVIDERS) {
      expect(sqlText).toContain(`'${provider}'`);
    }
    expect(sqlText.match(/'/g)?.length).toBe(BYOK_PROVIDERS.length * 2);
  });
});
