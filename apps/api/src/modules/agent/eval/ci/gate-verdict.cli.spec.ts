import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { summaryFileName } from '../runtime/eval-runtime';
import { REPO_ROOT } from '../workflow-text';
import { EVAL_TARGET_SUITES } from './eval-summary';

const run = promisify(execFile);
const API_ROOT = join(REPO_ROOT, 'apps/api');
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');
const CLI = 'src/modules/agent/eval/ci/gate-verdict.cli.ts';
const MODEL = 'openrouter:deepseek/deepseek-v4.1-flash';
const TRIALS = 10;
const CLI_TIMEOUT_MS = 60_000;

function securitySummary(suite: string, label = 'm', passes = TRIALS) {
  return {
    suite,
    model: MODEL,
    trials: TRIALS,
    cases: [
      {
        key: JSON.stringify({ message: label }),
        label,
        category: 'security',
        verdict: passes === TRIALS ? 'pass' : 'fail',
        passes,
        graderErrors: 0,
        errors: 0,
        turnErrors: 0,
        trials: TRIALS,
      },
    ],
  };
}

async function runCli(
  env: Record<string, string>
): Promise<{ exitCode: number; stdout: string }> {
  const {
    AI_EVAL_MODEL: _model,
    AI_EVAL_TRIALS: _trials,
    ...inherited
  } = process.env;
  try {
    const { stdout } = await run(TSX, [CLI], {
      cwd: API_ROOT,
      env: { ...inherited, ...env },
    });
    return { exitCode: 0, stdout };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'number'
    ) {
      return {
        exitCode: error.code,
        stdout:
          'stdout' in error && typeof error.stdout === 'string'
            ? error.stdout
            : '',
      };
    }
    throw error;
  }
}

describe('the gate-verdict CLI', () => {
  let dir: string;
  let output: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gate-cli-'));
    output = join(dir, 'github-output');
    await writeFile(output, '');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it(
    'writes the pass it decided to GITHUB_OUTPUT and exits 0',
    async () => {
      for (const suite of EVAL_TARGET_SUITES['eval-security']) {
        await writeFile(
          join(dir, summaryFileName(suite)),
          JSON.stringify(securitySummary(suite))
        );
      }

      const { exitCode } = await runCli({
        AI_EVAL_OUTPUT_DIR: dir,
        AI_EVAL_MODEL: MODEL,
        AI_EVAL_TRIALS: String(TRIALS),
        GITHUB_OUTPUT: output,
      });

      expect(exitCode).toBe(0);
      expect(await readFile(output, 'utf8')).toBe('verdict=pass\n');
    },
    CLI_TIMEOUT_MS
  );

  it(
    'writes the fail it decided to GITHUB_OUTPUT, exits 0 so the post step runs, and names the failing case',
    async () => {
      const [failing, passing] = EVAL_TARGET_SUITES['eval-security'];
      await writeFile(
        join(dir, summaryFileName(failing)),
        JSON.stringify(securitySummary(failing, 'exfiltration', TRIALS - 3))
      );
      await writeFile(
        join(dir, summaryFileName(passing)),
        JSON.stringify(securitySummary(passing))
      );

      const { exitCode, stdout } = await runCli({
        AI_EVAL_OUTPUT_DIR: dir,
        AI_EVAL_MODEL: MODEL,
        AI_EVAL_TRIALS: String(TRIALS),
        GITHUB_OUTPUT: output,
      });

      expect(exitCode).toBe(0);
      expect(await readFile(output, 'utf8')).toBe('verdict=fail\n');
      expect(stdout).toContain(
        `${failing}: exfiltration failed (${TRIALS - 3}/${TRIALS})`
      );
    },
    CLI_TIMEOUT_MS
  );

  it(
    'writes an inconclusive verdict and exits 1 when no summary was written',
    async () => {
      const { exitCode, stdout } = await runCli({
        AI_EVAL_OUTPUT_DIR: dir,
        AI_EVAL_MODEL: MODEL,
        AI_EVAL_TRIALS: String(TRIALS),
        GITHUB_OUTPUT: output,
      });

      expect(exitCode).toBe(1);
      expect(await readFile(output, 'utf8')).toBe('verdict=inconclusive\n');
      expect(stdout).toContain('copilot: no summary');
    },
    CLI_TIMEOUT_MS
  );

  it(
    'writes no verdict and exits 1 when its environment is incomplete',
    async () => {
      const { exitCode } = await runCli({
        AI_EVAL_OUTPUT_DIR: dir,
        AI_EVAL_TRIALS: String(TRIALS),
        GITHUB_OUTPUT: output,
      });

      expect(exitCode).toBe(1);
      expect(await readFile(output, 'utf8')).toBe('');
    },
    CLI_TIMEOUT_MS
  );
});
