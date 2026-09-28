import { describe, expect, it, vi } from 'vitest';

import { AiUnavailableError } from '../../domain/errors/ai-unavailable.error';
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
    const { resolver, enabledProviders } = resolverWith(['anthropic']);
    const context = await resolver.resolve({
      userId: 'anon-1',
      isAnonymous: true,
      clientIp: '203.0.113.9',
    });
    expect(enabledProviders).not.toHaveBeenCalled();
    expect(context.tier).toBe('anonymous');
    expect(context).toMatchObject({
      subject: { userId: 'anon-1', clientIp: '203.0.113.9' },
      tier: 'anonymous',
      billing: { kind: 'platform' },
      policy: { dailyAllowance: 'anonymous-share' },
    });
    expect(context.byokProviders.size).toBe(0);
  });

  it('resolves a registered caller without keys to free', async () => {
    const { resolver, enabledProviders } = resolverWith([]);
    const context = await resolver.resolve({
      userId: 'u-1',
      isAnonymous: false,
    });
    expect(enabledProviders).toHaveBeenCalledWith('u-1');
    expect(context.tier).toBe('free');
    expect(context.subject).toEqual({ userId: 'u-1' });
  });

  it('resolves a registered caller with a stored key to byok, still billed to the platform', async () => {
    const { resolver, enabledProviders } = resolverWith(['anthropic']);
    const context = await resolver.resolve({
      userId: 'u-1',
      isAnonymous: false,
    });
    expect(enabledProviders).toHaveBeenCalledWith('u-1');
    expect(context.tier).toBe('byok');
    expect(context.billing).toEqual({ kind: 'platform' });
    expect([...context.byokProviders]).toEqual(['anthropic']);
  });

  it('reports a key-store failure as an unavailable tier instead of guessing one', async () => {
    const cause = new Error('db down');
    const resolver = new TierResolver({
      enabledProviders: vi.fn().mockRejectedValue(cause),
    } as unknown as ByokService);

    const failure = resolver.resolve({ userId: 'u-1', isAnonymous: false });

    await expect(failure).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(failure).rejects.toMatchObject({
      dependency: 'tier',
      message: 'tier unavailable: db down',
      cause,
    });
  });
});
