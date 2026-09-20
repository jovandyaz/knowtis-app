import { describe, expect, it, vi } from 'vitest';

import { htmlToMarkdown } from '@knowtis/note-markdown';

import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import type { ProposedMutation } from '../../domain/proposed-mutation';
import type {
  AgentNote,
  NoteBody,
  NoteContentStatus,
} from '../../domain/retrieval';
import { markdownToNoteHtml } from '../sanitize/html-sanitizer';
import {
  collectTypes,
  EDITOR_VOCABULARY_MARKDOWN,
  persistedDocument,
} from '../sanitize/html-sanitizer.fixtures';
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

const READ_BOUND_CHARS = 10_000;
const TAIL_SENTINEL = 'Remember the passport.';

function editing(html: string, over: Partial<RetrievalPort> = {}) {
  const retrieval = makeRetrieval({
    getBody: vi.fn().mockResolvedValue({
      title: NOTE.title,
      html,
      updatedAt: NOTE.updatedAt,
    }),
    ...over,
  });
  return { retrieval, builder: new MutationProposalBuilder(retrieval) };
}

function contentHtmlOf(proposal: ProposedMutation): string {
  const { contentHtml } = proposal.payload as { contentHtml?: unknown };
  if (typeof contentHtml !== 'string') {
    throw new Error('expected an update payload carrying contentHtml');
  }
  return contentHtml;
}

describe('MutationProposalBuilder.buildEdit', () => {
  it('replaces only the targeted text and keeps the read timestamp as the base version', async () => {
    const { builder } = editing('<p>Buy milk and eggs.</p>');

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [{ oldText: 'milk', newText: 'oat milk' }],
    });

    const proposal = r._unsafeUnwrap();
    expect(proposal.kind).toBe('update');
    expect(contentHtmlOf(proposal)).toBe(
      markdownToNoteHtml('Buy oat milk and eggs.')
    );
    expect(proposal.baseVersion).toBe(NOTE.updatedAt);
  });

  it('applies edits in order, so a later one can target what an earlier one wrote', async () => {
    const { builder } = editing('<p>alpha</p>');

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [
        { oldText: 'alpha', newText: 'beta' },
        { oldText: 'beta', newText: 'gamma' },
      ],
    });

    expect(contentHtmlOf(r._unsafeUnwrap())).toBe(markdownToNoteHtml('gamma'));
  });

  it('names the failing edit by its one-based position when the text is absent', async () => {
    const { builder } = editing('<p>Buy milk and eggs.</p>');

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [
        { oldText: 'milk', newText: 'oat milk' },
        { oldText: 'bread', newText: 'rye' },
      ],
    });

    const error = r._unsafeUnwrapErr();
    expect(error.code).toBe('AGENT_EDIT_TEXT_NOT_FOUND');
    expect(error.message).toContain('Edit 2');
    expect(error.message).toContain('"bread"');
  });

  it('reports how many times an ambiguous target appears', async () => {
    const { builder } = editing('<p>draft and draft</p>');

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [{ oldText: 'draft', newText: 'final' }],
    });

    const error = r._unsafeUnwrapErr();
    expect(error.code).toBe('AGENT_EDIT_TEXT_AMBIGUOUS');
    expect(error.message).toContain('appears 2 times');
  });

  it('caps the text it echoes back, so a failed edit cannot flood the transcript', async () => {
    const { builder } = editing('<p>short body</p>');
    const long = 'z'.repeat(500);

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [{ oldText: long, newText: 'x' }],
    });

    const { message } = r._unsafeUnwrapErr();
    expect(message).toContain(`"${'z'.repeat(200)}…"`);
    expect(message).not.toContain('z'.repeat(201));
  });

  it('appends to a note whose body is longer than the read bound without losing the tail', async () => {
    const { builder } = editing(
      `<p>${'a'.repeat(READ_BOUND_CHARS)}</p><p>${TAIL_SENTINEL}</p>`
    );

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [],
      appendMarkdown: 'Also pack socks.',
    });

    const html = contentHtmlOf(r._unsafeUnwrap());
    expect(html).toContain(TAIL_SENTINEL);
    expect(html).toContain('Also pack socks.');
  });

  it('refuses an edit that leaves the note exactly as it was', async () => {
    const { builder } = editing('<p>Buy milk and eggs.</p>');

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [{ oldText: 'milk', newText: 'milk' }],
    });

    expect(r._unsafeUnwrapErr().code).toBe('AGENT_INVALID_PROPOSAL');
  });

  it.each([undefined, '   '])(
    'refuses a call with no edits and appendMarkdown %p',
    async (appendMarkdown) => {
      const { builder, retrieval } = editing('<p>body</p>');

      const r = await builder.buildEdit(USER, 'note-1', {
        edits: [],
        ...(appendMarkdown !== undefined && { appendMarkdown }),
      });

      expect(r._unsafeUnwrapErr().code).toBe('AGENT_INVALID_PROPOSAL');
      expect(retrieval.getBody).not.toHaveBeenCalled();
    }
  );

  it('reports a missing note', async () => {
    const { builder } = editing('<p>body</p>', {
      getBody: vi.fn().mockResolvedValue(null),
    });

    const r = await builder.buildEdit(USER, 'note-x', {
      edits: [{ oldText: 'a', newText: 'b' }],
    });

    expect(r._unsafeUnwrapErr().code).toBe('AGENT_NOTE_NOT_FOUND');
  });

  it('never reads the model-facing view, which would cost a conversion and a scan', async () => {
    const { builder, retrieval } = editing('<p>Buy milk.</p>');

    await builder.buildEdit(USER, 'note-1', {
      edits: [{ oldText: 'milk', newText: 'oat milk' }],
    });

    expect(retrieval.getBody).toHaveBeenCalledWith(USER, 'note-1');
    expect(retrieval.getById).not.toHaveBeenCalled();
  });

  it.each([
    [[{ oldText: 'a', newText: 'x' }], undefined, 'content edited (1 edit)'],
    [
      [
        { oldText: 'a', newText: 'x' },
        { oldText: 'b', newText: 'y' },
      ],
      undefined,
      'content edited (2 edits)',
    ],
    [[{ oldText: 'a', newText: 'x' }], 'tail', 'content edited (2 edits)'],
  ])('summarises the change as %#', async (edits, appendMarkdown, expected) => {
    const { builder } = editing('<p>a b c</p>');

    const r = await builder.buildEdit(USER, 'note-1', {
      edits,
      ...(appendMarkdown !== undefined && { appendMarkdown }),
    });

    expect(r._unsafeUnwrap().summary).toBe(`Update "Old": ${expected}`);
  });

  // The shared vocabulary fixture nests a task list, which the converter pair
  // flattens, so an edit to it is refused — this fixture is the same minus the
  // nesting, which is what proves an edit keeps what it can carry.
  const EDITABLE_VOCABULARY_MARKDOWN = EDITOR_VOCABULARY_MARKDOWN.replace(
    '\n  - [x] photo',
    ''
  );

  it('keeps every editor construct the note already held', async () => {
    const bodyHtml = markdownToNoteHtml(EDITABLE_VOCABULARY_MARKDOWN);
    const original = htmlToMarkdown(bodyHtml);
    const { builder } = editing(bodyHtml);

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [{ oldText: 'with **cash**', newText: 'with **a card**' }],
    });

    const html = contentHtmlOf(r._unsafeUnwrap());
    const types = [...collectTypes(persistedDocument(html))];
    for (const expected of [
      'table',
      'taskList',
      'taskItem',
      'highlight',
      'mermaidBlock',
    ]) {
      expect(types).toContain(expected);
    }

    const before = htmlToMarkdown(markdownToNoteHtml(original)).split('\n');
    const after = htmlToMarkdown(html).split('\n');
    const editedLine = before.findIndex((line) => line.includes('**cash**'));
    expect(editedLine).toBeGreaterThan(-1);
    expect(after).toHaveLength(before.length);
    expect(
      after.flatMap((line, i) => (line === before[i] ? [] : [i]))
    ).toStrictEqual([editedLine]);
    expect(after[editedLine]).toContain('**a card**');
  });

  // The guard asks whether the NOTE survives a round trip, not whether the
  // proposal is smaller — an edit the user asked for may legitimately remove a
  // whole paragraph, and refusing that would make the tool useless.
  it('allows an edit that deletes a paragraph outright', async () => {
    const bodyHtml = markdownToNoteHtml('# Trip\n\nKeep this.\n\nDrop this.');
    const { builder } = editing(bodyHtml);

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [{ oldText: '\n\nDrop this.', newText: '' }],
    });

    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const html = contentHtmlOf(r.value);
      expect(html).toContain('Keep this.');
      expect(html).not.toContain('Drop this.');
    }
  });

  it('refuses an edit to a note the converter cannot rebuild whole', async () => {
    const { builder } = editing(markdownToNoteHtml(EDITOR_VOCABULARY_MARKDOWN));

    const r = await builder.buildEdit(USER, 'note-1', {
      edits: [{ oldText: 'with **cash**', newText: 'with **a card**' }],
    });

    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_EDIT_WOULD_LOSE_CONTENT');
      expect(r.error.message).toContain('taskList');
    }
  });
});
