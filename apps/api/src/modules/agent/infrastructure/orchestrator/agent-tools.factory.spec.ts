import { describe, expect, it, vi } from 'vitest';

import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import { AgentToolsFactory } from './agent-tools.factory';

const USER = '11111111-1111-1111-1111-111111111111';

function makeRetrieval(over: Partial<RetrievalPort> = {}): RetrievalPort {
  return {
    search: vi.fn().mockResolvedValue([{ id: 'a', title: 'GTD' }]),
    getById: vi
      .fn()
      .mockResolvedValue({ id: 'a', title: 'GTD', content: '<p>do</p>' }),
    ...over,
  };
}

describe('AgentToolsFactory', () => {
  it('builds searchNotes + getNote tools bound to the userId', () => {
    const factory = new AgentToolsFactory(makeRetrieval());
    const tools = factory.build(USER);
    expect(Object.keys(tools).sort()).toEqual(['getNote', 'searchNotes']);
  });

  it('searchNotes executes against the retrieval port with the bound user', async () => {
    const retrieval = makeRetrieval();
    const tools = new AgentToolsFactory(retrieval).build(USER);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = await tools.searchNotes.execute!(
      { query: 'gtd' },
      {} as never
    );

    expect(retrieval.search).toHaveBeenCalledWith(USER, 'gtd');
    expect(result).toEqual([{ id: 'a', title: 'GTD' }]);
  });

  it('getNote returns a not-found marker when the note is inaccessible', async () => {
    const retrieval = makeRetrieval({
      getById: vi.fn().mockResolvedValue(null),
    });
    const tools = new AgentToolsFactory(retrieval).build(USER);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = await tools.getNote.execute!(
      { noteId: '22222222-2222-2222-2222-222222222222' },
      {} as never
    );

    expect(result).toEqual({ error: 'Note not found or not accessible.' });
  });
});
