import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRevision, releaseConfig } from './release.config';

const SHA = 'f95241c4d1f3a2b9e8c7d6a5b4c3d2e1f0a9b8c7';

describe('REVISION', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'revision-'));
    file = join(dir, 'REVISION');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('readRevision', () => {
    it('returns the commit the deploy wrote, without the trailing newline', () => {
      writeFileSync(file, `${SHA}\n`);

      expect(readRevision(file)).toBe(SHA);
    });

    it('returns undefined when the deploy wrote no file', () => {
      expect(readRevision(file)).toBeUndefined();
    });

    it.each([
      ['empty', ''],
      ['blank', '  \n'],
    ])('returns undefined when the file is %s', (_case, content) => {
      writeFileSync(file, content);

      expect(readRevision(file)).toBeUndefined();
    });
  });

  describe('releaseConfig', () => {
    it('exposes the commit as RELEASE_SHA', () => {
      writeFileSync(file, `${SHA}\n`);

      expect(releaseConfig(file)).toEqual({ RELEASE_SHA: SHA });
    });

    it('exposes nothing without a commit, so a RELEASE_SHA env var still applies', () => {
      writeFileSync(file, '');

      expect(releaseConfig(file)).toEqual({});
    });
  });
});
