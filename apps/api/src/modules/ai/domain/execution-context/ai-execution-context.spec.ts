import { describe, expect, it } from 'vitest';

import { createExecutionContext } from '../../testing/create-execution-context';
import { billingFor, PLATFORM_BILLING } from './ai-execution-context';

function keyedOn(provider: 'anthropic') {
  return createExecutionContext({ tier: 'byok', byokProviders: [provider] });
}

describe('billingFor', () => {
  it('switches billing to a stored-key provider and keeps the tier and subject', () => {
    const platform = keyedOn('anthropic');
    const billed = billingFor(platform, 'anthropic');
    expect(billed.billing).toEqual({ kind: 'byok', provider: 'anthropic' });
    expect(billed.tier).toBe('byok');
    expect(billed.subject).toBe(platform.subject);
    expect(platform.billing).toEqual(PLATFORM_BILLING);
  });

  it('returns the very same context for a provider the caller holds no key for', () => {
    const platform = keyedOn('anthropic');
    expect(billingFor(platform, 'openai')).toBe(platform);
  });

  it('returns the context unchanged for a provider that takes no stored key', () => {
    const platform = keyedOn('anthropic');
    expect(billingFor(platform, 'mistral')).toBe(platform);
  });
});
