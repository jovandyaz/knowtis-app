import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(__dirname, '..');
const DB_SPEC_SUFFIX = '.db.spec.ts';
const FIXTURE_ID = /'(00000000-[0-9a-f-]+)'/g;

function dbSpecFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return dbSpecFiles(path);
    }
    return path.endsWith(DB_SPEC_SUFFIX) ? [path] : [];
  });
}

describe('database fixture ids', () => {
  // Two db specs sharing an id delete each other's rows: every one of them
  // removes its fixtures by id in afterAll, and users cascade to their notes.
  // Sequential runs hide it; parallel forks turn it into an unreproducible flake.
  it('are owned by exactly one db spec', () => {
    const owners = new Map<string, string[]>();

    for (const file of dbSpecFiles(SRC_ROOT)) {
      const source = readFileSync(file, 'utf8');
      const relative = file.slice(SRC_ROOT.length + 1);
      for (const id of new Set(
        [...source.matchAll(FIXTURE_ID)].map(([, id]) => id)
      )) {
        owners.set(id, [...(owners.get(id) ?? []), relative]);
      }
    }

    const shared = [...owners]
      .filter(([, files]) => files.length > 1)
      .map(([id, files]) => `${id}: ${files.join(', ')}`);

    expect(shared).toEqual([]);
  });

  it('finds the db specs it is meant to guard', () => {
    expect(dbSpecFiles(SRC_ROOT).length).toBeGreaterThan(15);
  });
});
