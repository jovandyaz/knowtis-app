import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.config';

const baseEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
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
