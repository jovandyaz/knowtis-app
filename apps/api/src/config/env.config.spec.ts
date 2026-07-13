import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.config';

const baseEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
};

const validEnv = {
  DATABASE_URL: 'postgres://localhost:5432/knowtis_test',
  JWT_SECRET: 'a'.repeat(40) + '-access-secret-x',
  JWT_REFRESH_SECRET: 'b'.repeat(40) + '-refresh-secret-x',
};

describe('env.config agent vars', () => {
  it('defaults AI_AGENT_MAX_STEPS to 8 and AI_AGENT_MAX_MS to 120000', () => {
    const env = validateEnv(baseEnv);
    expect(env.AI_AGENT_MAX_STEPS).toBe(8);
    expect(env.AI_AGENT_MAX_MS).toBe(120000);
  });

  it('coerces overrides from strings', () => {
    const env = validateEnv({ ...baseEnv, AI_AGENT_MAX_STEPS: '5' });
    expect(env.AI_AGENT_MAX_STEPS).toBe(5);
  });

  it('rejects AI_AGENT_MAX_STEPS of 0 (below min 1)', () => {
    expect(() =>
      validateEnv({ ...baseEnv, AI_AGENT_MAX_STEPS: '0' })
    ).toThrow();
  });

  it('rejects AI_AGENT_MAX_STEPS of -1 (below min 1)', () => {
    expect(() =>
      validateEnv({ ...baseEnv, AI_AGENT_MAX_STEPS: '-1' })
    ).toThrow();
  });

  it('rejects AI_AGENT_MAX_STEPS of a non-coercible string', () => {
    expect(() =>
      validateEnv({ ...baseEnv, AI_AGENT_MAX_STEPS: 'abc' })
    ).toThrow();
  });

  it('rejects AI_AGENT_MAX_STEPS above max 20', () => {
    expect(() =>
      validateEnv({ ...baseEnv, AI_AGENT_MAX_STEPS: '21' })
    ).toThrow();
  });

  it('coerces AI_AGENT_MAX_MS from a numeric string', () => {
    const env = validateEnv({ ...baseEnv, AI_AGENT_MAX_MS: '60000' });
    expect(env.AI_AGENT_MAX_MS).toBe(60000);
  });

  it('rejects AI_AGENT_MAX_MS of -1 (below min 1000)', () => {
    expect(() => validateEnv({ ...baseEnv, AI_AGENT_MAX_MS: '-1' })).toThrow();
  });

  it('rejects AI_AGENT_MAX_MS of 500 (below min 1000)', () => {
    expect(() => validateEnv({ ...baseEnv, AI_AGENT_MAX_MS: '500' })).toThrow();
  });
});

describe('env.config oauth vars', () => {
  it('parses a valid env without any OAuth vars (all optional)', () => {
    const env = validateEnv(baseEnv);
    expect(env.OAUTH_ISSUER).toBeUndefined();
    expect(env.OAUTH_JWKS).toBeUndefined();
    expect(env.OAUTH_COOKIE_KEYS).toBeUndefined();
    expect(env.MCP_RESOURCE_URL).toBeUndefined();
  });

  it('accepts OAuth vars when provided', () => {
    const env = validateEnv({
      ...baseEnv,
      OAUTH_ISSUER: 'https://api.knowtis.app',
      OAUTH_JWKS: '{"keys":[]}',
      OAUTH_COOKIE_KEYS: 'a,b',
      MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
    });
    expect(env.OAUTH_ISSUER).toBe('https://api.knowtis.app');
    expect(env.MCP_RESOURCE_URL).toBe('https://mcp.knowtis.app/mcp');
  });

  it('rejects a non-URL OAUTH_ISSUER', () => {
    expect(() =>
      validateEnv({ ...baseEnv, OAUTH_ISSUER: 'not-a-url' })
    ).toThrow();
  });

  it('rejects a non-URL MCP_RESOURCE_URL', () => {
    expect(() =>
      validateEnv({ ...baseEnv, MCP_RESOURCE_URL: 'not-a-url' })
    ).toThrow();
  });
});

describe('validateEnv', () => {
  it('should accept a valid config and default BCRYPT_ROUNDS to 12', () => {
    const config = validateEnv(validEnv);
    expect(config.BCRYPT_ROUNDS).toBe(12);
  });

  it('should reject BCRYPT_ROUNDS below 10', () => {
    expect(() => validateEnv({ ...validEnv, BCRYPT_ROUNDS: '8' })).toThrow(
      /BCRYPT_ROUNDS/
    );
  });

  it('should accept BCRYPT_ROUNDS at the minimum boundary (10)', () => {
    const config = validateEnv({ ...validEnv, BCRYPT_ROUNDS: '10' });
    expect(config.BCRYPT_ROUNDS).toBe(10);
  });

  it('should accept BCRYPT_ROUNDS at the maximum boundary (15)', () => {
    const config = validateEnv({ ...validEnv, BCRYPT_ROUNDS: '15' });
    expect(config.BCRYPT_ROUNDS).toBe(15);
  });

  it('should reject BCRYPT_ROUNDS above 15', () => {
    expect(() => validateEnv({ ...validEnv, BCRYPT_ROUNDS: '16' })).toThrow(
      /BCRYPT_ROUNDS/
    );
  });

  it('should reject non-numeric BCRYPT_ROUNDS', () => {
    expect(() => validateEnv({ ...validEnv, BCRYPT_ROUNDS: 'abc' })).toThrow(
      /BCRYPT_ROUNDS/
    );
  });

  it('should reject equal access and refresh secrets', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_REFRESH_SECRET: validEnv.JWT_SECRET })
    ).toThrow(/must be different/);
  });

  it('should reject placeholder secrets in production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
      })
    ).toThrow(/placeholder/);
  });

  it('should allow placeholder secrets outside production', () => {
    const config = validateEnv({
      ...validEnv,
      NODE_ENV: 'development',
      JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
    });
    expect(config.NODE_ENV).toBe('development');
  });
});
