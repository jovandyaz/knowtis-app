import { QueryClient, type QueryKey } from '@tanstack/react-query';

import { describe, expect, it } from 'vitest';

import {
  invalidateNoteCollections,
  reconcileNoteAccess,
} from './note-invalidation';
import { notesQueryKeys, tagsQueryKeys } from './query-keys';

const SIDEBAR_RECENT_LIMIT = 20;

function seed(client: QueryClient, keys: QueryKey[]) {
  for (const key of keys) {
    client.setQueryData(key, {});
  }
}

const isInvalidated = (client: QueryClient, key: QueryKey) =>
  client.getQueryState(key)?.isInvalidated;

describe('invalidateNoteCollections', () => {
  it('marks every cache that aggregates notes stale', () => {
    const client = new QueryClient();
    const aggregates = [
      notesQueryKeys.list({ bucket: 'inbox' }),
      notesQueryKeys.recent(SIDEBAR_RECENT_LIMIT),
      notesQueryKeys.counts(),
      tagsQueryKeys.tree(),
    ];
    seed(client, aggregates);

    invalidateNoteCollections(client);

    expect(aggregates.map((key) => isInvalidated(client, key))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('leaves single-note and static caches untouched', () => {
    const client = new QueryClient();
    const untouched = [
      notesQueryKeys.detail('n1'),
      notesQueryKeys.supertagCatalog(),
    ];
    seed(client, untouched);

    invalidateNoteCollections(client);

    expect(untouched.map((key) => isInvalidated(client, key))).toEqual([
      false,
      false,
    ]);
  });
});

describe('reconcileNoteAccess', () => {
  it('marks every notes query stale when access to a note changes', () => {
    const client = new QueryClient();
    const notesQueries = [
      notesQueryKeys.detail('n1'),
      notesQueryKeys.people('n1'),
      notesQueryKeys.sharedNote('tok'),
      notesQueryKeys.list({ bucket: 'inbox' }),
    ];
    seed(client, notesQueries);

    reconcileNoteAccess(client, 'n1');

    expect(notesQueries.map((key) => isInvalidated(client, key))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});
