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
