import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(__dirname, '..');
const DB_SPEC_SUFFIX = '.db.spec.ts';
const SPEC_SUFFIX = '.spec.ts';
const FIXTURE_ID = /'(00000000-[0-9a-f-]+)'/g;
// DATABASE_CONNECTION is deliberately not a marker: it is the DI token specs
// that MOCK the database reference. Real-database specs gate on DB_AVAILABLE
// and build the pool through DatabaseModule.
const DB_MARKERS = [/\bDB_AVAILABLE\b/, /\bDatabaseModule\b/];

function specFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return specFiles(path, suffix);
    }
    return path.endsWith(suffix) ? [path] : [];
  });
}

describe('database fixture ids', () => {
  // Two db specs sharing an id delete each other's rows: every one of them
  // removes its fixtures by id in afterAll, and users cascade to their notes.
  // Sequential runs hide it; parallel forks turn it into an unreproducible flake.
  it('are owned by exactly one db spec', () => {
    const owners = new Map<string, string[]>();

    for (const file of specFiles(SRC_ROOT, DB_SPEC_SUFFIX)) {
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

  // The vitest config serializes db specs purely by this suffix, so a
  // database-touching spec named `*.spec.ts` silently lands back in the
  // parallel pool and reintroduces the flake this file exists to prevent.
  it('every spec touching the database is named *.db.spec.ts', () => {
    const guard = join(__dirname, 'fixture-ids.spec.ts');
    const offenders: string[] = [];

    for (const file of specFiles(SRC_ROOT, SPEC_SUFFIX)) {
      if (file.endsWith(DB_SPEC_SUFFIX) || file === guard) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      if (DB_MARKERS.some((marker) => marker.test(source))) {
        offenders.push(file.slice(SRC_ROOT.length + 1));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('finds the db specs it is meant to guard', () => {
    expect(specFiles(SRC_ROOT, DB_SPEC_SUFFIX).length).toBeGreaterThan(15);
  });
});
