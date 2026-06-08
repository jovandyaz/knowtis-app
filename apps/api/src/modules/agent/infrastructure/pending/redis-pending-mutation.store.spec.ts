import { describe, expect, it, vi } from 'vitest';

import { ProposedMutation } from '../../domain/proposed-mutation';
import { RedisPendingMutationStore } from './redis-pending-mutation.store';

function makeMutation(id: string) {
  const r = ProposedMutation.create({
    id,
    kind: 'create',
    payload: { title: 'GTD', contentHtml: '<p>x</p>' },
    summary: 'Create note "GTD"',
  });
  if (r.isErr()) {throw new Error('setup');}
  return r.value;
}

function makeRedis(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    client: {
      set: vi.fn(async (k: string, v: string) => {
        map.set(k, v);
        return 'OK';
      }),
      get: vi.fn(async (k: string) => map.get(k) ?? null),
      del: vi.fn(async (k: string) => (map.delete(k) ? 1 : 0)),
    },
  };
}

const cfg = { get: () => 600 } as never;

describe('RedisPendingMutationStore', () => {
  it('saves with a namespaced key and TTL', async () => {
    const redis = makeRedis();
    const store = new RedisPendingMutationStore(redis as never, cfg);
    const m = makeMutation('aaaa1111-1111-1111-1111-111111111111');

    await store.save({
      userId: 'u1',
      mutation: m,
      toolName: 'proposeCreateNote',
    });

    expect(redis.client.set).toHaveBeenCalledWith(
      'agent:proposal:aaaa1111-1111-1111-1111-111111111111',
      expect.any(String),
      'EX',
      600
    );
  });

  it('take returns and deletes the record for the owning user', async () => {
    const redis = makeRedis();
    const store = new RedisPendingMutationStore(redis as never, cfg);
    const m = makeMutation('aaaa1111-1111-1111-1111-111111111111');
    await store.save({
      userId: 'u1',
      mutation: m,
      toolName: 'proposeCreateNote',
    });

    const taken = await store.take(m.id, 'u1');

    expect(taken?.mutation.id).toBe(m.id);
    expect(redis.client.del).toHaveBeenCalledWith(`agent:proposal:${m.id}`);
  });

  it('take returns null for a different user (and does not delete)', async () => {
    const redis = makeRedis();
    const store = new RedisPendingMutationStore(redis as never, cfg);
    const m = makeMutation('aaaa1111-1111-1111-1111-111111111111');
    await store.save({
      userId: 'u1',
      mutation: m,
      toolName: 'proposeCreateNote',
    });

    const taken = await store.take(m.id, 'attacker');

    expect(taken).toBeNull();
    expect(redis.client.del).not.toHaveBeenCalled();
  });

  it('take returns null when the key is missing (expired)', async () => {
    const redis = makeRedis();
    const store = new RedisPendingMutationStore(redis as never, cfg);
    expect(await store.take('missing', 'u1')).toBeNull();
  });
});
