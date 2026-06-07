import { describe, expect, it, vi } from 'vitest';

import type { NoteReadRepository } from '../../../notes/domain/ports/note-read.repository';
import { KeywordRetrievalAdapter } from './keyword-retrieval.adapter';

const USER = '11111111-1111-1111-1111-111111111111';
const note = (id: string, title: string, content = '') => ({
  id,
  title,
  content,
  ownerId: USER,
});

function makeRepo(
  rows: { note: ReturnType<typeof note>; permission?: string }[]
): NoteReadRepository {
  return {
    findById: vi.fn(),
    findByIdWithOwner: vi.fn(),
    findByOwner: vi.fn(),
    findByShareToken: vi.fn(),
    findAccessibleByUser: vi.fn().mockResolvedValue(rows),
  } as unknown as NoteReadRepository;
}

describe('KeywordRetrievalAdapter', () => {
  it('search maps accessible notes to id+title hits', async () => {
    const repo = makeRepo([
      { note: note('a', 'GTD method') },
      { note: note('b', 'Biology') },
    ]);
    const adapter = new KeywordRetrievalAdapter(repo);

    const hits = await adapter.search(USER, 'method');

    expect(repo.findAccessibleByUser).toHaveBeenCalledWith(
      expect.objectContaining({ value: USER }),
      'method'
    );
    expect(hits).toEqual([
      { id: 'a', title: 'GTD method' },
      { id: 'b', title: 'Biology' },
    ]);
  });

  it('getById returns the note only when it is in the accessible set', async () => {
    const repo = makeRepo([{ note: note('a', 'GTD', '<p>do it</p>') }]);
    const adapter = new KeywordRetrievalAdapter(repo);

    const found = await adapter.getById(USER, 'a');
    expect(found).toEqual({ id: 'a', title: 'GTD', content: '<p>do it</p>' });
  });

  it('getById returns null for a note the user cannot access (never trusts the id)', async () => {
    const repo = makeRepo([{ note: note('a', 'GTD') }]);
    const adapter = new KeywordRetrievalAdapter(repo);

    const found = await adapter.getById(USER, 'not-accessible');
    expect(found).toBeNull();
  });

  it('returns empty when the userId is invalid (cannot brand)', async () => {
    const repo = makeRepo([]);
    const adapter = new KeywordRetrievalAdapter(repo);

    const hits = await adapter.search('not-a-uuid', 'x');
    expect(hits).toEqual([]);
  });
});
