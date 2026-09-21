import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

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

function group(builder: MutationProposalBuilder): NoteMutateToolGroup {
  return new NoteMutateToolGroup(builder);
}

const proposal: CreateProposedMutation = {
  id: 'p1',
  kind: 'create',
  summary: 'Create note "Plan"',
  payload: { title: 'Plan', contentHtml: '<h1>Plan</h1>' },
};

describe('NoteMutateToolGroup', () => {
  it('should be available only in the full phase (never on resume)', () => {
    const g = group({} as MutationProposalBuilder);
    expect(g.availableIn('full')).toBe(true);
    expect(g.availableIn('readonly')).toBe(false);
  });

  it('returns only {ok, proposalId, summary} to the model and never leaks the payload', async () => {
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
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('<h1>Plan</h1>');
  });

  it('captures the full proposal in the per-run collector', async () => {
    const builder = {
      buildCreate: vi.fn().mockResolvedValue(ok(proposal)),
    } as unknown as MutationProposalBuilder;
    const c = ctx();
    await run(group(builder), c, 'proposeCreateNote', {
      title: 'Plan',
      contentMarkdown: '# Plan',
    });
    expect(c.proposals.captured).toBe(proposal);
    expect(c.proposals.captured?.payload).toEqual({
      title: 'Plan',
      contentHtml: '<h1>Plan</h1>',
    });
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
    expect(JSON.stringify(out)).not.toContain('payload');
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

  it('captures a share proposal for confirmation without executing it', async () => {
    const shareProposal: ShareProposedMutation = {
      id: 'p3',
      kind: 'share',
      targetNoteId: 'n1',
      summary: 'Share "Plan" with a@b.com as viewer',
      payload: { targetEmail: 'a@b.com', permission: 'viewer' },
    };
    const builder = {
      buildShare: vi.fn().mockResolvedValue(ok(shareProposal)),
    } as unknown as MutationProposalBuilder;
    const c = ctx();
    expect(
      await run(group(builder), c, 'proposeShareNote', {
        noteId: 'n1',
        targetEmail: 'a@b.com',
        permission: 'viewer',
      })
    ).toEqual({ ok: true, proposalId: 'p3', summary: shareProposal.summary });
    expect(builder.buildShare).toHaveBeenCalledWith(
      'u1',
      'n1',
      'a@b.com',
      'viewer'
    );
    expect(c.proposals.captured).toBe(shareProposal);
  });
});

const NOTE_ID = '11111111-1111-4111-8111-111111111111';

const editProposal: UpdateProposedMutation = {
  id: 'p4',
  kind: 'update',
  targetNoteId: NOTE_ID,
  summary: 'Update "Plan": content edited (1 edit)',
  payload: { contentHtml: '<p>edited</p>' },
};

function editSchema(g: NoteMutateToolGroup): z.ZodType {
  const { inputSchema } = g.build(ctx()).proposeEditNote;
  if (!(inputSchema instanceof z.ZodType)) {
    throw new Error('expected a zod input schema');
  }
  return inputSchema;
}

describe('NoteMutateToolGroup.proposeEditNote', () => {
  const EDITS = [{ oldText: 'milk', newText: 'oat milk' }];

  it('forwards the edits and the append to the builder and returns only the slim result', async () => {
    const builder = {
      buildEdit: vi.fn().mockResolvedValue(ok(editProposal)),
    } as unknown as MutationProposalBuilder;
    const c = ctx();

    const out = await run(group(builder), c, 'proposeEditNote', {
      noteId: NOTE_ID,
      edits: EDITS,
      appendMarkdown: 'tail',
    });

    expect(builder.buildEdit).toHaveBeenCalledWith('u1', NOTE_ID, {
      edits: EDITS,
      appendMarkdown: 'tail',
    });
    expect(out).toStrictEqual({
      ok: true,
      proposalId: 'p4',
      summary: editProposal.summary,
    });
    expect(JSON.stringify(out)).not.toContain('payload');
    expect(c.proposals.captured).toBe(editProposal);
  });

  it('surfaces a builder refusal as an error and captures nothing', async () => {
    const builder = {
      buildEdit: vi
        .fn()
        .mockResolvedValue(err(AgentErrors.editTextNotFound(1, 'milk'))),
    } as unknown as MutationProposalBuilder;
    const c = ctx();

    const out = (await run(group(builder), c, 'proposeEditNote', {
      noteId: NOTE_ID,
      edits: EDITS,
    })) as { error: string };

    expect(out.error).toContain('Edit 1');
    expect(c.proposals.captured).toBeNull();
  });

  it('rejects an empty oldText, which would match everywhere', () => {
    const schema = editSchema(group({} as MutationProposalBuilder));

    expect(
      schema.safeParse({
        noteId: NOTE_ID,
        edits: [{ oldText: '', newText: 'x' }],
      }).success
    ).toBe(false);
  });

  it('rejects more edits than one proposal may carry', () => {
    const schema = editSchema(group({} as MutationProposalBuilder));

    expect(
      schema.safeParse({
        noteId: NOTE_ID,
        edits: Array.from({ length: 21 }, () => ({
          oldText: 'a',
          newText: 'b',
        })),
      }).success
    ).toBe(false);
  });

  it('rejects a noteId the model did not get from a tool', () => {
    const schema = editSchema(group({} as MutationProposalBuilder));

    expect(
      schema.safeParse({ noteId: 'not-a-uuid', edits: EDITS }).success
    ).toBe(false);
  });

  it('defaults edits to none so an append-only call is valid', () => {
    const schema = editSchema(group({} as MutationProposalBuilder));

    expect(
      schema.safeParse({ noteId: NOTE_ID, appendMarkdown: 'tail' })
    ).toMatchObject({ success: true, data: { edits: [] } });
  });

  it('is offered only in the phase that can propose mutations at all', () => {
    const g = group({} as MutationProposalBuilder);

    expect(g.build(ctx()).proposeEditNote).toBeDefined();
    expect(g.availableIn('readonly')).toBe(false);
  });

  it('steers the model here instead of a whole-body rewrite', () => {
    const tools = group({} as MutationProposalBuilder).build(ctx());

    expect(tools.proposeEditNote.description).toContain(
      'Prefer this over proposeUpdateNote'
    );
    expect(tools.proposeUpdateNote.description).toContain(
      'Refused when you did not receive the whole note'
    );
  });
});
