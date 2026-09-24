import { describe, expect, it, vi } from 'vitest';

import { ProposedMutation } from '../domain/proposed-mutation';
import { RejectMutationHandler } from './reject-mutation.handler';

const TURN = '55555555-5555-4555-8555-555555555555';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';

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
  return {
    userId: 'u1',
    turnId: TURN,
    conversationId: CONVERSATION,
    mutation: r.value,
  };
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
      expect(r.value.outcome).toContain('declined');
      expect(r.value.outcome).toContain('too long');
      expect(r.value.turnId).toBe(TURN);
      expect(r.value.conversationId).toBe(CONVERSATION);
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
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_PROPOSAL_EXPIRED');
    }
  });
});
