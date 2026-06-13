import { describe, expect, it } from 'vitest';

import { NOTE_FIXTURE_SETS } from './fixtures/note-sets';
import { RecordingFixtureRetrieval } from './recording-fixture-retrieval';

const USER = 'eval-user';

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
