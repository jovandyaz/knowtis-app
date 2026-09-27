import { describe, expect, it, vi } from 'vitest';

import type { ByokService } from './byok.service';
import { TierResolver } from './tier-resolver.service';

function resolverWith(providers: readonly string[]) {
  const enabledProviders = vi.fn().mockResolvedValue(new Set(providers));
  const resolver = new TierResolver({
    enabledProviders,
  } as unknown as ByokService);
  return { resolver, enabledProviders };
}

describe('TierResolver', () => {
  it('resolves an anonymous caller to the anonymous tier without key providers', async () => {
    const { resolver, enabledProviders } = resolverWith([]);
    const context = await resolver.resolve({
      userId: 'anon-1',
      isAnonymous: true,
      clientIp: '203.0.113.9',
    });
    expect(enabledProviders).toHaveBeenCalledWith('anon-1', true);
    expect(context).toMatchObject({
      subject: { userId: 'anon-1', clientIp: '203.0.113.9' },
      tier: 'anonymous',
      billing: { kind: 'platform' },
      policy: { dailyAllowance: 'anonymous-share' },
    });
    expect(context.byokProviders.size).toBe(0);
  });

  it('resolves a registered caller without keys to free', async () => {
    const { resolver } = resolverWith([]);
    const context = await resolver.resolve({
      userId: 'u-1',
      isAnonymous: false,
    });
    expect(context.tier).toBe('free');
    expect(context.subject).toEqual({ userId: 'u-1' });
  });

  it('resolves a registered caller with a stored key to byok, still billed to the platform', async () => {
    const { resolver } = resolverWith(['anthropic']);
    const context = await resolver.resolve({
      userId: 'u-1',
      isAnonymous: false,
    });
    expect(context.tier).toBe('byok');
    expect(context.billing).toEqual({ kind: 'platform' });
    expect([...context.byokProviders]).toEqual(['anthropic']);
  });

  it('propagates a key-store failure instead of guessing a tier', async () => {
    const resolver = new TierResolver({
      enabledProviders: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as ByokService);
    await expect(
      resolver.resolve({ userId: 'u-1', isAnonymous: false })
    ).rejects.toThrow('db down');
  });
});
