import { describe, expect, it } from 'vitest';

import { SCAN_BATCH_SIZE, scanById, type KeysetSource } from './id-keyset-scan';

interface Row {
  readonly id: string;
}

function recordingSource(ids: readonly string[]) {
  const askedAfter: (string | null)[] = [];
  const source: KeysetSource<Row> = {
    async statesAfter(after, limit) {
      askedAfter.push(after);
      return ids
        .filter((id) => after === null || id > after)
        .slice(0, limit)
        .map((id) => ({ id }));
    },
  };
  return { source, askedAfter };
}

async function scannedIds(source: KeysetSource<Row>): Promise<string[]> {
  const ids: string[] = [];
  for await (const { id } of scanById(source)) {
    ids.push(id);
  }
  return ids;
}

describe('scanById', () => {
  it('yields every row in id order, each batch read after the last id of the one before', async () => {
    const ids = Array.from(
      { length: SCAN_BATCH_SIZE * 2 },
      (_, index) => `row-${String(index).padStart(3, '0')}`
    );
    const { source, askedAfter } = recordingSource(ids);

    const scanned = await scannedIds(source);

    expect(scanned).toEqual(ids);
    expect(askedAfter).toEqual([null, ids[SCAN_BATCH_SIZE - 1], ids.at(-1)]);
  });

  it('asks once and yields nothing from an empty source', async () => {
    const { source, askedAfter } = recordingSource([]);

    const scanned = await scannedIds(source);

    expect(scanned).toEqual([]);
    expect(askedAfter).toEqual([null]);
  });
});
