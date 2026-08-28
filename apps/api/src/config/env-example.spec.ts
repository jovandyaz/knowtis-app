import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TokenHasher } from '@jovandyaz/auth-nestjs';
import { parse } from 'dotenv';
import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.config';

const ENV_EXAMPLE = parse(
  readFileSync(join(__dirname, '..', '..', '.env.example'), 'utf8')
);

describe('apps/api/.env.example', () => {
  it('validates as shipped, so a fresh clone boots on a straight copy', () => {
    expect(() => validateEnv(ENV_EXAMPLE)).not.toThrow();
  });

  it('ships a TOKEN_HASH_KEY the auth module can build its hasher from', () => {
    expect(
      () => new TokenHasher(ENV_EXAMPLE['TOKEN_HASH_KEY'] ?? '')
    ).not.toThrow();
  });

  it('ships a TOKEN_HASH_KEY that production refuses', () => {
    expect(() =>
      validateEnv({ ...ENV_EXAMPLE, NODE_ENV: 'production' })
    ).toThrow(/TOKEN_HASH_KEY looks like a placeholder/);
  });
});
