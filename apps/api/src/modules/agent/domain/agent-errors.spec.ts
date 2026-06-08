import { describe, expect, it } from 'vitest';

import { AgentErrors } from './agent-errors';

describe('AgentErrors', () => {
  it('builds a stale-note error with a code', () => {
    const e = AgentErrors.staleNote('22222222-2222-2222-2222-222222222222');
    expect(e.code).toBe('AGENT_STALE_NOTE');
    expect(e.message).toContain('changed');
  });

  it('builds a proposal-expired error', () => {
    expect(AgentErrors.proposalExpired().code).toBe('AGENT_PROPOSAL_EXPIRED');
  });
});
