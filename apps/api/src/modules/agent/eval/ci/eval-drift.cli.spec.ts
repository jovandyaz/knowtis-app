import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { summaryFileName } from '../runtime/eval-runtime';
import { REPO_ROOT } from '../workflow-text';

const run = promisify(execFile);
const API_ROOT = join(REPO_ROOT, 'apps/api');
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');
const CLI = 'src/modules/agent/eval/ci/eval-drift.cli.ts';
const MODEL = 'openrouter:deepseek/deepseek-v4.1-flash';
const OTHER_MODEL = 'anthropic:claude-sonnet-5';
const ARTIFACT = 'eval-results-fast-model-security';
const TRIALS = 3;
const LABELS = ['a', 'b', 'c', 'd', 'e', 'f'];
const CLI_TIMEOUT_MS = 60_000;

const WORKING_GH = `#!/bin/sh
case "$1 $2" in
  "run list") printf '%s' '[{"databaseId": 7}]' ;;
  "run download")
    while [ $# -gt 0 ]; do
      if [ "$1" = "--dir" ]; then dir="$2"; fi
      shift
    done
    mkdir -p "$dir"
    cp "$FAKE_GH_BASELINE_DIR"/* "$dir"/
    ;;
  *) printf '%s' '{"artifacts": [{"name": "${ARTIFACT}", "expired": false}]}' ;;
esac
`;

const NO_RUNS_GH = `#!/bin/sh
printf '%s' '[]'
`;

const FAILING_GH = `#!/bin/sh
echo 'HTTP 502: bad gateway' >&2
exit 1
`;

function behaviorSummary(verdict: 'pass' | 'fail', model = MODEL) {
  return {
    suite: 'copilot',
    model,
    trials: TRIALS,
    cases: LABELS.map((label) => ({
      key: JSON.stringify({ message: label }),
      label,
      category: 'behavior',
      verdict,
      passes: verdict === 'pass' ? TRIALS : 0,
      graderErrors: 0,
      errors: 0,
      turnErrors: 0,
      trials: TRIALS,
    })),
  };
}

describe('the eval-drift CLI', () => {
  let scratch: string;
  let current: string;
  let earlier: string;
  let stepSummary: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'eval-drift-cli-'));
    current = join(scratch, 'current');
    earlier = join(scratch, 'earlier');
    stepSummary = join(scratch, 'step-summary');
    await mkdir(current);
    await mkdir(earlier);
    await writeFile(stepSummary, '');
  });
  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  async function writeSummary(dir: string, value: unknown): Promise<void> {
    await writeFile(
      join(dir, summaryFileName('copilot')),
      JSON.stringify(value)
    );
  }

  async function runCli(gh: string): Promise<number> {
    const bin = join(scratch, 'bin');
    await mkdir(bin);
    await writeFile(join(bin, 'gh'), gh);
    await chmod(join(bin, 'gh'), 0o755);
    try {
      await run(TSX, [CLI], {
        cwd: API_ROOT,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}`,
          AI_EVAL_OUTPUT_DIR: current,
          EVAL_TARGET: 'eval-security',
          EVAL_DRIFT_ARTIFACT_NAME: ARTIFACT,
          GITHUB_REPOSITORY: 'owner/repo',
          GITHUB_RUN_ID: '99',
          GITHUB_STEP_SUMMARY: stepSummary,
          FAKE_GH_BASELINE_DIR: earlier,
        },
      });
      return 0;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'number'
      ) {
        return error.code;
      }
      throw error;
    }
  }

  it(
    'exits non-zero on a significant regression against its baseline',
    async () => {
      await writeSummary(earlier, behaviorSummary('pass'));
      await writeSummary(current, behaviorSummary('fail'));

      expect(await runCli(WORKING_GH)).toBe(1);
      expect(await readFile(stepSummary, 'utf8')).toContain(
        'Significant regression: this leg fails.'
      );
    },
    CLI_TIMEOUT_MS
  );

  it(
    'exits 0 when the flips go the other way',
    async () => {
      await writeSummary(earlier, behaviorSummary('fail'));
      await writeSummary(current, behaviorSummary('pass'));

      expect(await runCli(WORKING_GH)).toBe(0);
    },
    CLI_TIMEOUT_MS
  );

  it(
    'exits 0 without a baseline',
    async () => {
      await writeSummary(current, behaviorSummary('fail'));

      expect(await runCli(NO_RUNS_GH)).toBe(0);
    },
    CLI_TIMEOUT_MS
  );

  it(
    'exits 0 with a baseline of another model',
    async () => {
      await writeSummary(earlier, behaviorSummary('pass', OTHER_MODEL));
      await writeSummary(current, behaviorSummary('fail'));

      expect(await runCli(WORKING_GH)).toBe(0);
      expect(await readFile(stepSummary, 'utf8')).toContain(
        'is not comparable'
      );
    },
    CLI_TIMEOUT_MS
  );

  it(
    'exits 0 when the baseline lookup fails, and reports the error',
    async () => {
      await writeSummary(current, behaviorSummary('fail'));

      expect(await runCli(FAILING_GH)).toBe(0);
      expect(await readFile(stepSummary, 'utf8')).toContain('HTTP 502');
    },
    CLI_TIMEOUT_MS
  );
});
