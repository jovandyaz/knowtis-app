import { describe, expect, it } from 'vitest';

import { createExecutionContext } from '../../testing/create-execution-context';
import { billedByKey, PLATFORM_BILLING } from './ai-execution-context';

describe('billedByKey', () => {
  it('switches billing to the named key and keeps everything else', () => {
    const platform = createExecutionContext({
      tier: 'byok',
      byokProviders: ['anthropic'],
    });
    const billed = billedByKey(platform, 'anthropic');
    expect(billed.billing).toEqual({ kind: 'byok', provider: 'anthropic' });
    expect(billed.tier).toBe('byok');
    expect(billed.subject).toBe(platform.subject);
    expect(platform.billing).toEqual(PLATFORM_BILLING);
  });

  it('refuses a provider the caller holds no key for', () => {
    const platform = createExecutionContext({ tier: 'free' });
    expect(() => billedByKey(platform, 'openai')).toThrow(
      'no stored key for openai'
    );
  });
});
