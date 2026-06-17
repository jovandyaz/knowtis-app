import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { AgentErrors } from '../../domain/agent-errors';
import type { CreateProposedMutation } from '../../domain/proposed-mutation';
import { MutationProposalBuilder } from '../orchestrator/mutation-proposal.builder';
import { ProposalCollector } from '../orchestrator/proposal-collector';
import { WebSourceCollector } from '../orchestrator/web-source.collector';
import type { AgentToolContext } from './agent-tool';
import { NoteMutateToolGroup } from './note-mutate.tool-group';

function ctx(): AgentToolContext {
  return {
    userId: 'u1',
    phase: 'full',
    proposals: new ProposalCollector(),
    webSources: new WebSourceCollector(),
  };
}

function run(
  group: NoteMutateToolGroup,
  c: AgentToolContext,
  name: string,
  input: unknown
) {
  const t = group.build(c)[name] as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  return t.execute(input, {});
}

const PREVIEW = '<h1>secret preview</h1>'.repeat(2000);

const proposal: CreateProposedMutation = {
  id: 'p1',
  kind: 'create',
  summary: 'Create note "Plan"',
  previewHtml: PREVIEW,
  payload: { title: 'Plan', contentHtml: '<h1>Plan</h1>' },
};

describe('NoteMutateToolGroup', () => {
  it('should be available only in the full phase (never on resume)', () => {
    const g = new NoteMutateToolGroup({} as MutationProposalBuilder);
    expect(g.availableIn('full')).toBe(true);
    expect(g.availableIn('readonly')).toBe(false);
  });

  it('returns only {ok, proposalId, summary} to the model and never leaks previewHtml or payload', async () => {
    const builder = {
      buildCreate: vi.fn().mockResolvedValue(ok(proposal)),
    } as unknown as MutationProposalBuilder;
    const out = await run(
      new NoteMutateToolGroup(builder),
      ctx(),
      'proposeCreateNote',
      { title: 'Plan', contentMarkdown: '# Plan' }
    );
    expect(out).toEqual({
      ok: true,
      proposalId: 'p1',
      summary: 'Create note "Plan"',
    });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('previewHtml');
    expect(serialized).not.toContain('secret preview');
    expect(serialized).not.toContain('payload');
  });

  it('captures the full proposal (incl. previewHtml) in the per-run collector', async () => {
    const builder = {
      buildCreate: vi.fn().mockResolvedValue(ok(proposal)),
    } as unknown as MutationProposalBuilder;
    const c = ctx();
    await run(new NoteMutateToolGroup(builder), c, 'proposeCreateNote', {
      title: 'Plan',
      contentMarkdown: '# Plan',
    });
    expect(c.proposals.captured).toBe(proposal);
    expect(c.proposals.captured?.previewHtml).toBe(PREVIEW);
  });

  it('returns {error} and captures nothing when the builder fails', async () => {
    const builder = {
      buildCreate: vi
        .fn()
        .mockResolvedValue(err(AgentErrors.invalidProposal('bad title'))),
    } as unknown as MutationProposalBuilder;
    const c = ctx();
    const out = (await run(
      new NoteMutateToolGroup(builder),
      c,
      'proposeCreateNote',
      { title: 'x', contentMarkdown: 'y' }
    )) as { error: string };
    expect(out.error).toBe('Invalid proposal: bad title');
    expect(c.proposals.captured).toBeNull();
  });
});
