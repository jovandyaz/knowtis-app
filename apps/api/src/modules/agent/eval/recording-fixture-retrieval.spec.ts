import { describe, expect, it } from 'vitest';

import { htmlToMarkdown } from '@knowtis/note-markdown';

import { NOTE_FIXTURE_SETS } from './fixtures/note-sets';
import { RecordingFixtureRetrieval } from './recording-fixture-retrieval';

const USER = 'eval-user';
const FIDELITY = NOTE_FIXTURE_SETS.fidelity[0];
const WHOLE_BODY = 'The whole note, every word of it.';

describe('RecordingFixtureRetrieval', () => {
  it('search matches title/content case-insensitively and records the call', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed(NOTE_FIXTURE_SETS.topic);

    const hits = await adapter.search(USER, 'AURORA');

    expect(hits.map((h) => h.id)).toEqual([
      '44444444-4444-4444-8444-444444444444',
    ]);
    expect(adapter.getCalls()).toEqual([
      { name: 'searchNotes', args: { query: 'AURORA' } },
    ]);
  });

  it('search returns no hits for an absent topic', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed(NOTE_FIXTURE_SETS.empty);

    expect(await adapter.search(USER, 'aurora')).toEqual([]);
  });

  it('getById returns the note or null and records getNote', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed(NOTE_FIXTURE_SETS.topic);

    const note = await adapter.getById(
      USER,
      '44444444-4444-4444-8444-444444444444'
    );
    expect(note?.title).toBe('Project Aurora spec');
    expect(await adapter.getById(USER, 'missing')).toBeNull();
    expect(adapter.getCalls().map((c) => c.name)).toEqual([
      'getNote',
      'getNote',
    ]);
  });

  it('getBody hands back html the model-facing content converts from exactly', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed(NOTE_FIXTURE_SETS.fidelity);

    const body = await adapter.getBody(USER, FIDELITY.id);

    expect(body?.title).toBe(FIDELITY.title);
    expect(body?.updatedAt).toBe(FIDELITY.updatedAt);
    expect(htmlToMarkdown(body?.html ?? '')).toBe(FIDELITY.content);
  });

  it('getBody records nothing, since no model tool call made it', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed(NOTE_FIXTURE_SETS.fidelity);

    await adapter.getBody(USER, FIDELITY.id);

    expect(adapter.getCalls()).toEqual([]);
  });

  it('getBody returns null for an unknown note', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed(NOTE_FIXTURE_SETS.fidelity);

    expect(await adapter.getBody(USER, 'missing')).toBeNull();
  });

  it('getBody serves the whole note when content is only a view of it', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed([
      { ...FIDELITY, content: 'a partial view', body: WHOLE_BODY },
    ]);

    const body = await adapter.getBody(USER, FIDELITY.id);

    expect(htmlToMarkdown(body?.html ?? '')).toBe(WHOLE_BODY);
  });

  it('getById never hands the model the whole-note body', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed([
      { ...FIDELITY, content: 'a partial view', body: WHOLE_BODY },
    ]);

    const note = await adapter.getById(USER, FIDELITY.id);

    expect(note).not.toHaveProperty('body');
    expect(note).toStrictEqual({
      id: FIDELITY.id,
      title: FIDELITY.title,
      content: 'a partial view',
      contentStatus: FIDELITY.contentStatus,
      createdAt: FIDELITY.createdAt,
      updatedAt: FIDELITY.updatedAt,
      isOwner: FIDELITY.isOwner,
      isSharedWithMe: FIDELITY.isSharedWithMe,
      isPubliclyShared: FIDELITY.isPubliclyShared,
    });
  });

  it('listRecent honours the limit and records listRecentNotes', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed(NOTE_FIXTURE_SETS.recent);

    const hits = await adapter.listRecent(USER, 2);
    expect(hits).toHaveLength(2);
    expect(adapter.getCalls()).toEqual([
      { name: 'listRecentNotes', args: { limit: 2 } },
    ]);
  });

  it('listRecent returns most-recent-first regardless of fixture order', async () => {
    const older = NOTE_FIXTURE_SETS.recent[2];
    const newer = NOTE_FIXTURE_SETS.recent[0];
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed([older, newer]);

    const hits = await adapter.listRecent(USER, 2);

    expect(hits.map((h) => h.id)).toEqual([newer.id, older.id]);
  });

  it('overview counts totals and records getNotesOverview', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed(NOTE_FIXTURE_SETS.recent);

    const overview = await adapter.overview(USER);
    expect(overview).toEqual({ total: 3, owned: 3, sharedWithMe: 0 });
    expect(adapter.getCalls()).toEqual([
      { name: 'getNotesOverview', args: {} },
    ]);
  });

  it('seed clears the previous call log', async () => {
    const adapter = new RecordingFixtureRetrieval();
    adapter.seed(NOTE_FIXTURE_SETS.recent);
    await adapter.overview(USER);
    adapter.seed(NOTE_FIXTURE_SETS.topic);

    expect(adapter.getCalls()).toEqual([]);
  });
});
