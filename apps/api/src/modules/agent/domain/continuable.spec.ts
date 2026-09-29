import { describe, expect, it } from 'vitest';

import { isContinuable } from './continuable';

describe('isContinuable', () => {
  const left = {
    tier: 'free',
    messages: { used: 3, limit: 30, resetsAt: 'x' },
  } as const;
  const spent = {
    tier: 'free',
    messages: { used: 30, limit: 30, resetsAt: 'x' },
  } as const;
  const byok = { tier: 'byok', messages: null } as const;
  it.each([
    ['max_steps', left, true],
    ['token_budget', left, true],
    ['time_limit', left, true],
    ['max_steps', spent, false],
    ['max_steps', byok, true],
    ['max_steps', null, true],
    ['completed', left, false],
    ['length', left, false],
    ['error', left, false],
    ['aborted', byok, false],
    [null, left, false],
  ] as const)('%s with %j → %s', (reason, quota, expected) => {
    expect(isContinuable(reason, quota)).toBe(expected);
  });
});
