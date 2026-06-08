import { describe, expect, it, vi } from 'vitest';

import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import { MutationProposalBuilder } from './mutation-proposal.builder';

function makeRetrieval(over: Partial<RetrievalPort> = {}): RetrievalPort {
  return {
    search: vi.fn(),
    getById: vi.fn().mockResolvedValue({
      id: 'note-1',
      title: 'Old',
      content: '<p>old</p>',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-02-01T00:00:00.000Z',
      isOwner: true,
      isSharedWithMe: false,
      isPubliclyShared: false,
    }),
    listRecent: vi.fn(),
    overview: vi.fn(),
    ...over,
  };
}

const USER = 'u1';

describe('MutationProposalBuilder', () => {
  it('builds a create proposal with sanitized html', async () => {
    const builder = new MutationProposalBuilder(makeRetrieval());
    const r = await builder.buildCreate(USER, 'GTD', '# Hi');
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.kind).toBe('create');
      expect(
        (r.value.payload as { contentHtml: string }).contentHtml
      ).toContain('<h1>Hi</h1>');
    }
  });

  it('builds an update proposal capturing baseVersion', async () => {
    const builder = new MutationProposalBuilder(makeRetrieval());
    const r = await builder.buildUpdate(USER, 'note-1', {
      contentMarkdown: '## New',
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.targetNoteId).toBe('note-1');
      expect(r.value.baseVersion).toBe('2024-02-01T00:00:00.000Z');
    }
  });

  it('rejects update when the note is not accessible', async () => {
    const builder = new MutationProposalBuilder(
      makeRetrieval({ getById: vi.fn().mockResolvedValue(null) })
    );
    const r = await builder.buildUpdate(USER, 'note-x', { title: 'x' });
    expect(r.isErr()).toBe(true);
  });

  it('builds a share proposal', async () => {
    const builder = new MutationProposalBuilder(makeRetrieval());
    const r = await builder.buildShare(USER, 'note-1', 'a@b.com', 'editor');
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.kind).toBe('share');
      expect((r.value.payload as { targetEmail: string }).targetEmail).toBe(
        'a@b.com'
      );
    }
  });
});
