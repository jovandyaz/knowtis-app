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

  it('keeps the stale-note code and a non-blank message for unusual identifiers', () => {
    for (const id of ['', '   ', 'not-a-uuid']) {
      const e = AgentErrors.staleNote(id);
      expect(e.code).toBe('AGENT_STALE_NOTE');
      expect(e.message.trim().length).toBeGreaterThan(0);
    }
  });

  it('embeds the reason in an invalid-proposal error', () => {
    const e = AgentErrors.invalidProposal('summary is required');
    expect(e.code).toBe('AGENT_INVALID_PROPOSAL');
    expect(e.message).toContain('summary is required');
  });
});
