import { describe, expect, it, vi } from 'vitest';

import { ProposedMutation } from '../domain/proposed-mutation';
import { RejectMutationHandler } from './reject-mutation.handler';

function rec() {
  const r = ProposedMutation.create({
    id: 'p1',
    kind: 'create',
    payload: { title: 'GTD', contentHtml: '<p>x</p>' },
    summary: 's',
  });
  if (r.isErr()) {
    throw new Error('setup');
  }
  return { userId: 'u1', toolName: 'proposeCreateNote', mutation: r.value };
}

describe('RejectMutationHandler', () => {
  it('discards the proposal and returns a denial outcome', async () => {
    const store = { take: vi.fn().mockResolvedValue(rec()), save: vi.fn() };
    const h = new RejectMutationHandler(store as never);
    const r = await h.execute({
      proposalId: 'p1',
      userId: 'u1',
      reason: 'too long',
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.toolName).toBe('proposeCreateNote');
      expect(r.value.outcome).toContain('declined');
      expect(r.value.outcome).toContain('too long');
    }
    expect(store.take).toHaveBeenCalledWith('p1', 'u1');
  });

  it('errors when the proposal is gone', async () => {
    const store = { take: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const r = await new RejectMutationHandler(store as never).execute({
      proposalId: 'x',
      userId: 'u1',
    });
    expect(r.isErr()).toBe(true);
  });
});
