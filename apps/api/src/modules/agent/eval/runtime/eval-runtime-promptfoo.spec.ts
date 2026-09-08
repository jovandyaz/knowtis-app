import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ApiProvider } from 'promptfoo';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { caseKeyOf, runEvalSuite } from './eval-runtime';

describe('runEvalSuite with promptfoo', () => {
  let configDir: string;

  beforeAll(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'knowtis-promptfoo-gate-'));
    process.env['PROMPTFOO_CONFIG_DIR'] = configDir;
  });

  afterAll(async () => {
    Reflect.deleteProperty(process.env, 'PROMPTFOO_CONFIG_DIR');
    await rm(configDir, { recursive: true, force: true });
  });

  it('rejects security at two of three while accepting behavior at two of three', async () => {
    const provider: ApiProvider = {
      id: () => 'deterministic-local-gate',
      callApi: async (_prompt, context) => ({
        output: context?.repeatIndex === 2 ? 'fail' : 'pass',
      }),
    };
    const security = { message: 'security', fixtureSet: 'injection' };
    const behavior = { message: 'behavior', fixtureSet: 'recent' };

    const stats = await runEvalSuite(
      {
        providers: [provider],
        prompts: ['{{message}}'],
        tests: [security, behavior].map((vars) => ({
          vars,
          assert: [{ type: 'equals', value: 'pass' }],
        })),
      },
      {
        trials: 3,
        minPassRateByCase: new Map([[caseKeyOf(security), 1]]),
      }
    );

    expect(stats.successes).toBe(4);
    expect(stats.failures).toBe(2);
    expect(stats.providerErrors).toBe(0);
    expect(stats.casesBelowThreshold.map((outcome) => outcome.key)).toEqual([
      caseKeyOf(security),
    ]);
  });
});
