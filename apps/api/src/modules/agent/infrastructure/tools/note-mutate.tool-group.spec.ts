import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { VerifiedIdentityPolicy } from '../../../users/verified-identity.policy';
import { AgentErrors } from '../../domain/agent-errors';
import type {
  CreateProposedMutation,
  ShareProposedMutation,
  UpdateProposedMutation,
} from '../../domain/proposed-mutation';
import { MutationProposalBuilder } from '../orchestrator/mutation-proposal.builder';
import { ProposalCollector } from '../orchestrator/proposal-collector';
import { WebFetchAllowlist } from '../orchestrator/web-fetch-allowlist';
import { WebSourceCollector } from '../orchestrator/web-source.collector';
import type { AgentToolContext } from './agent-tool';
import { NoteMutateToolGroup } from './note-mutate.tool-group';

function ctx(): AgentToolContext {
  return {
    userId: 'u1',
    phase: 'full',
    byokTurn: false,
    proposals: new ProposalCollector(),
    webSources: new WebSourceCollector(),
    webFetchAllowlist: new WebFetchAllowlist(),
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

function verified(value: boolean): VerifiedIdentityPolicy {
  return {
    isVerified: vi.fn().mockResolvedValue(value),
  } as unknown as VerifiedIdentityPolicy;
}

function group(
  builder: MutationProposalBuilder,
  identity: VerifiedIdentityPolicy = verified(true)
): NoteMutateToolGroup {
  return new NoteMutateToolGroup(builder, identity);
}

const proposal: CreateProposedMutation = {
  id: 'p1',
  kind: 'create',
  summary: 'Create note "Plan"',
  previewHtml: PREVIEW,
  payload: { title: 'Plan', contentHtml: '<h1>Plan</h1>' },
};

describe('NoteMutateToolGroup', () => {
  it('should be available only in the full phase (never on resume)', () => {
    const g = group({} as MutationProposalBuilder);
    expect(g.availableIn('full')).toBe(true);
    expect(g.availableIn('readonly')).toBe(false);
  });

  it('returns only {ok, proposalId, summary} to the model and never leaks previewHtml or payload', async () => {
    const builder = {
      buildCreate: vi.fn().mockResolvedValue(ok(proposal)),
    } as unknown as MutationProposalBuilder;
    const out = await run(group(builder), ctx(), 'proposeCreateNote', {
      title: 'Plan',
      contentMarkdown: '# Plan',
    });
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
    await run(group(builder), c, 'proposeCreateNote', {
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
    const out = (await run(group(builder), c, 'proposeCreateNote', {
      title: 'x',
      contentMarkdown: 'y',
    })) as { error: string };
    expect(out.error).toBe('Invalid proposal: bad title');
    expect(c.proposals.captured).toBeNull();
  });

  it('proposeUpdateNote captures the proposal and returns only the slim result', async () => {
    const updateProposal: UpdateProposedMutation = {
      id: 'p2',
      kind: 'update',
      targetNoteId: 'n1',
      summary: 'Update note "Plan"',
      previewHtml: PREVIEW,
      payload: { title: 'New title' },
    };
    const builder = {
      buildUpdate: vi.fn().mockResolvedValue(ok(updateProposal)),
    } as unknown as MutationProposalBuilder;
    const c = ctx();
    const out = await run(group(builder), c, 'proposeUpdateNote', {
      noteId: 'n1',
      title: 'New title',
    });
    expect(out).toEqual({
      ok: true,
      proposalId: 'p2',
      summary: 'Update note "Plan"',
    });
    expect(JSON.stringify(out)).not.toContain('previewHtml');
    expect(c.proposals.captured).toBe(updateProposal);
  });

  it('proposeShareNote returns {error} and captures nothing when the builder fails', async () => {
    const builder = {
      buildShare: vi
        .fn()
        .mockResolvedValue(err(AgentErrors.invalidProposal('note not found'))),
    } as unknown as MutationProposalBuilder;
    const c = ctx();
    const out = (await run(group(builder), c, 'proposeShareNote', {
      noteId: 'n1',
      targetEmail: 'a@b.com',
      permission: 'viewer',
    })) as { error: string };
    expect(out.error).toBe('Invalid proposal: note not found');
    expect(c.proposals.captured).toBeNull();
  });

  describe('proposeShareNote verified-identity gate', () => {
    const shareProposal: ShareProposedMutation = {
      id: 'p3',
      kind: 'share',
      targetNoteId: 'n1',
      summary: 'Share "Plan" with a@b.com as viewer',
      payload: { targetEmail: 'a@b.com', permission: 'viewer' },
    };
    const input = {
      noteId: 'n1',
      targetEmail: 'a@b.com',
      permission: 'viewer',
    };

    it('refuses to propose for an unverified caller, tells the model to relay the verification step and captures nothing', async () => {
      const builder = {
        buildShare: vi.fn().mockResolvedValue(ok(shareProposal)),
      } as unknown as MutationProposalBuilder;
      const identity = verified(false);
      const c = ctx();
      const out = (await run(
        group(builder, identity),
        c,
        'proposeShareNote',
        input
      )) as { error: string };
      expect(out).toEqual({
        error: AgentErrors.emailNotVerified().message,
      });
      expect(identity.isVerified).toHaveBeenCalledWith('u1');
      expect(builder.buildShare).not.toHaveBeenCalled();
      expect(c.proposals.captured).toBeNull();
    });

    it('proposes as before for a verified caller', async () => {
      const builder = {
        buildShare: vi.fn().mockResolvedValue(ok(shareProposal)),
      } as unknown as MutationProposalBuilder;
      const c = ctx();
      const out = await run(
        group(builder, verified(true)),
        c,
        'proposeShareNote',
        input
      );
      expect(out).toEqual({
        ok: true,
        proposalId: 'p3',
        summary: 'Share "Plan" with a@b.com as viewer',
      });
      expect(builder.buildShare).toHaveBeenCalledWith(
        'u1',
        'n1',
        'a@b.com',
        'viewer'
      );
      expect(c.proposals.captured).toBe(shareProposal);
    });

    it('does not consult the verified-identity policy for create or update proposals', async () => {
      const builder = {
        buildCreate: vi.fn().mockResolvedValue(ok(proposal)),
      } as unknown as MutationProposalBuilder;
      const identity = verified(false);
      const out = await run(
        group(builder, identity),
        ctx(),
        'proposeCreateNote',
        { title: 'Plan', contentMarkdown: '# Plan' }
      );
      expect(out).toMatchObject({ ok: true, proposalId: 'p1' });
      expect(identity.isVerified).not.toHaveBeenCalled();
    });
  });
});
