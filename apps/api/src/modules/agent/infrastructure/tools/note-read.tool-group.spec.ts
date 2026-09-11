import { describe, expect, it, vi } from 'vitest';

import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import { ProposalCollector } from '../orchestrator/proposal-collector';
import { WebFetchAllowlist } from '../orchestrator/web-fetch-allowlist';
import { WebSourceCollector } from '../orchestrator/web-source.collector';
import type { AgentToolContext } from './agent-tool';
import { NoteReadToolGroup } from './note-read.tool-group';

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
  group: NoteReadToolGroup,
  c: AgentToolContext,
  name: string,
  input: unknown
) {
  const t = group.build(c)[name] as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  return t.execute(input, {});
}

describe('NoteReadToolGroup', () => {
  it('never forwards the note store message but keeps it as the cause', async () => {
    const upstream = new Error(
      'relation "notes" ... duplicate key value violates unique constraint'
    );
    const retrieval = {
      search: vi.fn().mockRejectedValue(upstream),
      listUnindexed: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      listRecent: vi.fn(),
      overview: vi.fn(),
    } as unknown as RetrievalPort;
    const group = new NoteReadToolGroup(retrieval);

    const thrown = await run(group, ctx(), 'searchNotes', { query: 'x' }).catch(
      (e: unknown) => e
    );

    expect(thrown).toMatchObject({
      name: 'ToolExecutionError',
      code: 'NOTE_STORE_FAILED',
      message: expect.not.stringContaining('relation'),
    });
    expect((thrown as Error).cause).toBe(upstream);
  });
});

const hit = (id: string) => ({
  id,
  title: id,
  updatedAt: '2026-07-01T00:00:00.000Z',
  isOwner: true,
  isSharedWithMe: false,
  isPubliclyShared: false,
});

function searching(hits: unknown[], unindexed: unknown[]) {
  const retrieval = {
    search: vi.fn().mockResolvedValue(hits),
    listUnindexed: vi.fn().mockResolvedValue(unindexed),
    getById: vi.fn(),
    listRecent: vi.fn(),
    overview: vi.fn(),
  } as unknown as RetrievalPort;
  return { retrieval, group: new NoteReadToolGroup(retrieval) };
}

describe('NoteReadToolGroup.searchNotes pending-index fallback', () => {
  it('does not spend a query on pending notes when the search matched', async () => {
    const { group, retrieval } = searching([hit('found')], [hit('fresh')]);

    const out = await run(group, ctx(), 'searchNotes', { query: 'x' });

    expect(out).toEqual({ hits: [hit('found')] });
    expect(retrieval.listUnindexed).not.toHaveBeenCalled();
  });

  it('names the notes semantic search cannot reach yet when nothing matched', async () => {
    const { group } = searching([], [hit('fresh')]);

    const out = await run(group, ctx(), 'searchNotes', { query: 'x' });

    expect(out).toEqual({ hits: [], unindexed: [hit('fresh')] });
  });

  it('reports a plain miss when nothing matched and nothing is pending', async () => {
    const { group } = searching([], []);

    expect(await run(group, ctx(), 'searchNotes', { query: 'x' })).toEqual({
      hits: [],
    });
  });

  it('caps the pending hint so a cold index cannot flood the transcript', async () => {
    const { group, retrieval } = searching([], [hit('fresh')]);

    await run(group, ctx(), 'searchNotes', { query: 'x' });

    expect(retrieval.listUnindexed).toHaveBeenCalledWith('u1', 5);
  });
});
