import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldEnv } from '../setup-env.mjs';

let workDir;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'knowtis-setup-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('scaffoldEnv', () => {
  it('creates .env from .env.example when .env is missing', () => {
    writeFileSync(join(workDir, '.env.example'), 'FOO=bar\n');

    const result = scaffoldEnv(workDir);

    expect(result).toEqual({ created: true, path: join(workDir, '.env') });
    expect(readFileSync(join(workDir, '.env'), 'utf8')).toBe('FOO=bar\n');
  });

  it('does NOT overwrite an existing .env', () => {
    writeFileSync(join(workDir, '.env.example'), 'FOO=bar\n');
    writeFileSync(join(workDir, '.env'), 'FOO=customised\n');

    const result = scaffoldEnv(workDir);

    expect(result).toEqual({ created: false, path: join(workDir, '.env') });
    expect(readFileSync(join(workDir, '.env'), 'utf8')).toBe('FOO=customised\n');
  });

  it('returns { created: false, missingExample: true } when .env.example is absent', () => {
    const result = scaffoldEnv(workDir);
    expect(result.created).toBe(false);
    expect(result.missingExample).toBe(true);
    expect(existsSync(join(workDir, '.env'))).toBe(false);
  });
});
