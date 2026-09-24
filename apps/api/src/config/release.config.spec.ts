import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRevision } from './release.config';

const SHA = 'f95241c4d1f3a2b9e8c7d6a5b4c3d2e1f0a9b8c7';

describe('readRevision', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'revision-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the commit the deploy wrote, without the trailing newline', () => {
    const file = join(dir, 'REVISION');
    writeFileSync(file, `${SHA}\n`);

    expect(readRevision(file)).toBe(SHA);
  });

  it.each([
    ['absent', null],
    ['empty', ''],
    ['blank', '  \n'],
  ])('returns undefined when the file is %s', (_case, content) => {
    const file = join(dir, 'REVISION');
    if (content !== null) {
      writeFileSync(file, content);
    }

    expect(readRevision(file)).toBeUndefined();
  });
});
