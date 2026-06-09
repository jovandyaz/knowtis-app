import { describe, expect, it, vi } from 'vitest';

import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import { AgentToolsFactory } from './agent-tools.factory';

const USER = '11111111-1111-1111-1111-111111111111';

const META = {
  updatedAt: '2024-01-15T10:00:00.000Z',
  isOwner: true,
  isSharedWithMe: false,
  isPubliclyShared: false,
};

function makeRetrieval(over: Partial<RetrievalPort> = {}): RetrievalPort {
  return {
    search: vi.fn().mockResolvedValue([{ id: 'a', title: 'GTD', ...META }]),
    getById: vi.fn().mockResolvedValue({
      id: 'a',
      title: 'GTD',
      content: '<p>do</p>',
      createdAt: '2024-01-01T00:00:00.000Z',
      ...META,
    }),
    listRecent: vi.fn().mockResolvedValue([{ id: 'a', title: 'GTD', ...META }]),
    overview: vi
      .fn()
      .mockResolvedValue({ total: 5, owned: 3, sharedWithMe: 2 }),
    ...over,
  };
}

function makeBuilder() {
  return { buildCreate: vi.fn(), buildUpdate: vi.fn(), buildShare: vi.fn() };
}

describe('AgentToolsFactory', () => {
  it('builds searchNotes, getNote, listRecentNotes, and getNotesOverview tools bound to the userId', () => {
    const factory = new AgentToolsFactory(
      makeRetrieval(),
      makeBuilder() as never
    );
    const tools = factory.build(USER);
    expect(Object.keys(tools).sort()).toEqual([
      'getNote',
      'getNotesOverview',
      'listRecentNotes',
      'proposeCreateNote',
      'proposeShareNote',
      'proposeUpdateNote',
      'searchNotes',
    ]);
  });

  it('buildReadOnly returns exactly the four read tools with no propose tools', () => {
    const factory = new AgentToolsFactory(
      makeRetrieval(),
      makeBuilder() as never
    );
    const tools = factory.buildReadOnly(USER);
    expect(Object.keys(tools).sort()).toEqual([
      'getNote',
      'getNotesOverview',
      'listRecentNotes',
      'searchNotes',
    ]);
  });

  it('searchNotes executes against the retrieval port with the bound user', async () => {
    const retrieval = makeRetrieval();
    const tools = new AgentToolsFactory(
      retrieval,
      makeBuilder() as never
    ).build(USER);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = await tools.searchNotes.execute!(
      { query: 'gtd' },
      {} as never
    );

    expect(retrieval.search).toHaveBeenCalledWith(USER, 'gtd');
    expect(result).toEqual([{ id: 'a', title: 'GTD', ...META }]);
  });

  it('getNote returns a not-found marker when the note is inaccessible', async () => {
    const retrieval = makeRetrieval({
      getById: vi.fn().mockResolvedValue(null),
    });
    const tools = new AgentToolsFactory(
      retrieval,
      makeBuilder() as never
    ).build(USER);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = await tools.getNote.execute!(
      { noteId: '22222222-2222-2222-2222-222222222222' },
      {} as never
    );

    expect(result).toEqual({ error: 'Note not found or not accessible.' });
  });

  it('listRecentNotes delegates to retrieval.listRecent with bound userId and limit', async () => {
    const retrieval = makeRetrieval();
    const tools = new AgentToolsFactory(
      retrieval,
      makeBuilder() as never
    ).build(USER);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = await tools.listRecentNotes.execute!(
      { limit: 3 },
      {} as never
    );

    expect(retrieval.listRecent).toHaveBeenCalledWith(USER, 3);
    expect(result).toEqual([{ id: 'a', title: 'GTD', ...META }]);
  });

  it('getNotesOverview delegates to retrieval.overview with bound userId', async () => {
    const retrieval = makeRetrieval();
    const tools = new AgentToolsFactory(
      retrieval,
      makeBuilder() as never
    ).build(USER);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = await tools.getNotesOverview.execute!({}, {} as never);

    expect(retrieval.overview).toHaveBeenCalledWith(USER);
    expect(result).toEqual({ total: 5, owned: 3, sharedWithMe: 2 });
  });

  it('proposeCreateNote returns a proposal marker', async () => {
    const builder = {
      buildCreate: vi.fn().mockResolvedValue({
        isOk: () => true,
        isErr: () => false,
        value: { id: 'p1', kind: 'create' },
      }),
      buildUpdate: vi.fn(),
      buildShare: vi.fn(),
    };
    const tools = new AgentToolsFactory(
      makeRetrieval(),
      builder as never
    ).build(USER);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = await tools.proposeCreateNote.execute!(
      { title: 'GTD', contentMarkdown: '# hi' },
      {} as never
    );
    expect(result).toEqual({ __proposal: { id: 'p1', kind: 'create' } });
    expect(builder.buildCreate).toHaveBeenCalledWith(USER, 'GTD', '# hi');
  });
});
