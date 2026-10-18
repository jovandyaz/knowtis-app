import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { summaryFileName } from '../runtime/eval-runtime';
import {
  describeSchemaError,
  evalSummarySchema,
  isEvalTarget,
  readSuiteSummaries,
} from './eval-summary';

describe('readSuiteSummaries', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'eval-summary-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads each suite in order, telling a missing file from an unreadable one', async () => {
    const summary = { suite: 'copilot', model: 'm', trials: 1, cases: [] };
    await writeFile(
      join(dir, summaryFileName('copilot')),
      JSON.stringify(summary)
    );
    await writeFile(join(dir, summaryFileName('transcript-replay')), '{');

    const result = await readSuiteSummaries(dir, [
      'copilot',
      'injection-guard',
      'transcript-replay',
    ]);

    expect([...result.keys()]).toEqual([
      'copilot',
      'injection-guard',
      'transcript-replay',
    ]);
    expect(result.get('copilot')).toEqual({ status: 'read', raw: summary });
    expect(result.get('injection-guard')).toEqual({ status: 'missing' });
    expect(result.get('transcript-replay')).toMatchObject({
      status: 'unreadable',
    });
  });

  it('reads a summary the directory cannot be read for as unreadable, not missing', async () => {
    const result = await readSuiteSummaries(join(dir, 'missing-dir'), [
      'copilot',
    ]);

    expect(result.get('copilot')).toEqual({ status: 'missing' });
    await writeFile(join(dir, 'not-a-dir'), '');
    const throughAFile = await readSuiteSummaries(join(dir, 'not-a-dir'), [
      'copilot',
    ]);
    expect(throughAFile.get('copilot')).toMatchObject({ status: 'unreadable' });
  });
});

describe('describeSchemaError', () => {
  it('names the first issue by its path', () => {
    const parsed = evalSummarySchema.safeParse({
      suite: 'copilot',
      model: 'm',
      trials: 1,
      cases: [{ key: 'k', label: 'l', passes: -1, trials: 1 }],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error && describeSchemaError(parsed.error)).toMatch(
      /^cases\.0\.passes: /
    );
  });

  it('names the root when the whole value is wrong', () => {
    const parsed = evalSummarySchema.safeParse('not a summary');

    expect(parsed.error && describeSchemaError(parsed.error)).toMatch(
      /^\(root\): /
    );
  });
});

describe('isEvalTarget', () => {
  it.each(['eval', 'eval-security'])('accepts the %s target', (target) => {
    expect(isEvalTarget(target)).toBe(true);
  });

  it.each(['eval-judgments', '', 'toString', '__proto__'])(
    'rejects %j',
    (target) => {
      expect(isEvalTarget(target)).toBe(false);
    }
  );
});
