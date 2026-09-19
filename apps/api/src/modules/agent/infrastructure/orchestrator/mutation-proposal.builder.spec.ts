import { describe, expect, it, vi } from 'vitest';

import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import type {
  AgentNote,
  NoteBody,
  NoteContentStatus,
} from '../../domain/retrieval';
import { MutationProposalBuilder } from './mutation-proposal.builder';

const NOTE: AgentNote = {
  id: 'note-1',
  title: 'Old',
  content: 'old',
  contentStatus: 'complete',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-02-01T00:00:00.000Z',
  isOwner: true,
  isSharedWithMe: false,
  isPubliclyShared: false,
};

const BODY: NoteBody = {
  title: NOTE.title,
  html: '<p>old</p>',
  updatedAt: NOTE.updatedAt,
};

function makeRetrieval(over: Partial<RetrievalPort> = {}): RetrievalPort {
  return {
    search: vi.fn(),
    listUnindexed: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(NOTE),
    getBody: vi.fn().mockResolvedValue(BODY),
    listRecent: vi.fn(),
    overview: vi.fn(),
    ...over,
  };
}

function readingStatus(contentStatus: NoteContentStatus): RetrievalPort {
  return makeRetrieval({
    getById: vi.fn().mockResolvedValue({ ...NOTE, contentStatus }),
  });
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
    if (r.isOk() && r.value.kind === 'update') {
      expect(r.value.targetNoteId).toBe('note-1');
      expect(r.value.baseVersion).toBe('2024-02-01T00:00:00.000Z');
    } else {
      throw new Error('expected an update proposal');
    }
  });

  it('rejects create when content sanitizes to empty', async () => {
    const builder = new MutationProposalBuilder(makeRetrieval());
    const r = await builder.buildCreate(USER, 'X', '[ref]: http://example.com');
    expect(r.isErr()).toBe(true);
  });

  it('rejects an update with no changes', async () => {
    const builder = new MutationProposalBuilder(makeRetrieval());
    const r = await builder.buildUpdate(USER, 'note-1', {});
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

  it('reads a share target through getBody, never paying for the model-facing view', async () => {
    const retrieval = makeRetrieval();
    const builder = new MutationProposalBuilder(retrieval);

    const r = await builder.buildShare(USER, 'note-1', 'a@b.com', 'viewer');

    expect(retrieval.getBody).toHaveBeenCalledWith(USER, 'note-1');
    expect(retrieval.getById).not.toHaveBeenCalled();
    expect(r._unsafeUnwrap().summary).toBe(
      'Share "Old" with a@b.com as viewer'
    );
    expect(r._unsafeUnwrap().baseVersion).toBe(NOTE.updatedAt);
  });

  it('reads a title-only update through getBody, never paying for the model-facing view', async () => {
    const retrieval = makeRetrieval();
    const builder = new MutationProposalBuilder(retrieval);

    const r = await builder.buildUpdate(USER, 'note-1', { title: 'New' });

    expect(retrieval.getBody).toHaveBeenCalledWith(USER, 'note-1');
    expect(retrieval.getById).not.toHaveBeenCalled();
    expect(r._unsafeUnwrap().summary).toBe('Update "Old": title → "New"');
    expect(r._unsafeUnwrap().baseVersion).toBe(NOTE.updatedAt);
  });

  it('reads a content update through getById, which is what carries contentStatus', async () => {
    const retrieval = makeRetrieval();
    const builder = new MutationProposalBuilder(retrieval);

    const r = await builder.buildUpdate(USER, 'note-1', {
      contentMarkdown: '## New',
    });

    expect(retrieval.getById).toHaveBeenCalledWith(USER, 'note-1');
    expect(r.isOk()).toBe(true);
  });

  it.each([
    ['truncated', 'proposeEditNote'],
    ['withheld', 'withheld'],
  ] as const)(
    'refuses to replace the body of a %s note',
    async (contentStatus, hint) => {
      const builder = new MutationProposalBuilder(readingStatus(contentStatus));

      const r = await builder.buildUpdate(USER, 'note-1', {
        contentMarkdown: '## New',
      });

      expect(r._unsafeUnwrapErr().code).toBe('AGENT_WHOLE_BODY_UPDATE_REFUSED');
      expect(r._unsafeUnwrapErr().message).toContain(hint);
    }
  );

  it('refuses a title-and-content update on a truncated note whole', async () => {
    const builder = new MutationProposalBuilder(readingStatus('truncated'));

    const r = await builder.buildUpdate(USER, 'note-1', {
      title: 'New',
      contentMarkdown: '## New',
    });

    expect(r._unsafeUnwrapErr().code).toBe('AGENT_WHOLE_BODY_UPDATE_REFUSED');
  });

  it('reports a missing note on the title-only path', async () => {
    const builder = new MutationProposalBuilder(
      makeRetrieval({ getBody: vi.fn().mockResolvedValue(null) })
    );

    const r = await builder.buildUpdate(USER, 'note-x', { title: 'x' });

    expect(r._unsafeUnwrapErr().code).toBe('AGENT_NOTE_NOT_FOUND');
  });

  it('reports a missing note on the content path', async () => {
    const builder = new MutationProposalBuilder(
      makeRetrieval({ getById: vi.fn().mockResolvedValue(null) })
    );

    const r = await builder.buildUpdate(USER, 'note-x', {
      contentMarkdown: '## New',
    });

    expect(r._unsafeUnwrapErr().code).toBe('AGENT_NOTE_NOT_FOUND');
  });

  it('reports a missing note on the share path', async () => {
    const builder = new MutationProposalBuilder(
      makeRetrieval({ getBody: vi.fn().mockResolvedValue(null) })
    );

    const r = await builder.buildShare(USER, 'note-x', 'a@b.com', 'viewer');

    expect(r._unsafeUnwrapErr().code).toBe('AGENT_NOTE_NOT_FOUND');
  });
});
