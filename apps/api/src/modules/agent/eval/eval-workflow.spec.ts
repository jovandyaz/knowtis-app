import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODEL_INTENTS, type ModelIntent } from '@knowtis/shared-types';

import { PLATFORM_SEED_MODELS } from '../../ai/domain/model-catalog/platform-resolution';
import { EVAL_TARGET_SUITES } from './ci/eval-summary';
import { EVAL_CATEGORIES } from './runtime/eval-runtime';
import {
  jobSection,
  jqTestPatterns,
  readWorkflow,
  REPO_ROOT,
  runScripts,
} from './workflow-text';

const WORKFLOW = readWorkflow('nightly-eval.yml');
const PROJECT = readFileSync(join(REPO_ROOT, 'apps/api/project.json'), 'utf8');
const EVAL_CONFIG = readFileSync(
  join(REPO_ROOT, 'apps/api/vitest.eval.config.ts'),
  'utf8'
);
const NO_TESTS_FAIL_RE = /^ +passWithNoTests: false,$/m;
const EVAL_DIR = join(REPO_ROOT, 'apps/api/src/modules/agent/eval');
const SUMMARY_WRITER_RE = /prepareEvalOutput\('([\w-]+)'\)/g;
const DRIFT_STEP_RE =
  /^ +- name: Compare against earlier runs\n +if: always\(\)\n +continue-on-error: true\n +env:\n +GH_TOKEN: \$\{\{ github\.token \}\}\n +EVAL_DRIFT_ARTIFACT_NAME: (.+)\n +EVAL_TARGET: \$\{\{ matrix\.target \}\}\n +run: npx nx run api:eval-drift$/m;
const UPLOAD_NAME_RE = /^ +name: (eval-results-.+)$/m;
const LEG_TARGET_RE = /^ +target: (\S+)$/gm;
const SECURITY_TARGET_CATEGORY_RE =
  /"eval-security": \{[^}]*?"env": \{ "AI_EVAL_CATEGORY": "(\w+)" \}/s;
const LEG_RE =
  /^ +- leg: (\S+)\n +model: (.+)\n +target: (\S+)\n +trials: (\d+)$/gm;
const LEG_START_RE = /^ +- leg: /gm;
const RESOLVE_OUTPUT_RE =
  /^ {6}(\w+): \$\{\{ steps\.read\.outputs\.(\w+) \}\}$/gm;
const EVALS_NEED_RESOLVE_RE = /^ {4}needs: resolve$/m;
const UNSET_SECRETS_EXIT_RE =
  /if \[ -z "\$KNOWTIS_API_URL" \] \|\| \[ -z "\$MODEL_GATE_TOKEN" \]; then\n +echo "::notice::.+"\n +exit 0\n +fi/;
const GUARDED_ACTIVE_READ_RE =
  /if ! body=\$\(curl [^)]+\/api\/v1\/internal\/model-gate\/active"\); then\n +echo "::warning::.+"\n +exit 0\n +fi/;
const FAILING_EXIT_RE = /exit [1-9]/;
const ALIAS_PIN = 'openrouter:~anthropic/claude-sonnet-latest';
const NEWLINE_INJECTION = 'openrouter:x/y\nbalanced=evil';
const TRAILING_NEWLINE = 'openrouter:x/y\n';
const EXPRESSION_OPEN = '${{';
const REFERENCE_MODEL = 'anthropic:claude-sonnet-5';
const BEHAVIOR_TRIALS = '3';
const SECURITY_TRIALS = '10';

function servedModelPattern(): RegExp {
  const [script = ''] = runScripts(jobSection(WORKFLOW, 'resolve'));
  const [pattern] = jqTestPatterns(script);
  if (!pattern) {
    throw new Error('the resolve job validates no served model id');
  }
  return pattern;
}

function overridable(intent: ModelIntent, repositoryVariable: string): string {
  return `\${{ needs.resolve.outputs.${intent} || vars.${repositoryVariable} || '${PLATFORM_SEED_MODELS[intent]}' }}`;
}

describe('weekly eval workflow', () => {
  it('runs exactly these legs, each production model reading what prod serves, then its variable, then its seed', () => {
    const defaultModel = overridable('balanced', 'AI_EVAL_DEFAULT_MODEL');
    const legs = [...WORKFLOW.matchAll(LEG_RE)].map(
      ([, leg, model, target, trials]) => ({ leg, model, target, trials })
    );

    expect(legs).toStrictEqual([
      {
        leg: 'reference',
        model: REFERENCE_MODEL,
        target: 'eval',
        trials: BEHAVIOR_TRIALS,
      },
      {
        leg: 'default-model',
        model: defaultModel,
        target: 'eval',
        trials: BEHAVIOR_TRIALS,
      },
      {
        leg: 'default-model-security',
        model: defaultModel,
        target: 'eval-security',
        trials: SECURITY_TRIALS,
      },
      {
        leg: 'fast-model-security',
        model: overridable('fast', 'AI_EVAL_FAST_MODEL'),
        target: 'eval-security',
        trials: SECURITY_TRIALS,
      },
      {
        leg: 'deep-model-security',
        model: overridable('powerful', 'AI_EVAL_DEEP_MODEL'),
        target: 'eval-security',
        trials: SECURITY_TRIALS,
      },
    ]);
  });

  it('declares no leg the shape above cannot read', () => {
    expect(WORKFLOW.match(LEG_START_RE)).toHaveLength(
      [...WORKFLOW.matchAll(LEG_RE)].length
    );
  });

  it('declares a resolve job the evals job needs', () => {
    const outputs = [
      ...jobSection(WORKFLOW, 'resolve').matchAll(RESOLVE_OUTPUT_RE),
    ].map(([, name, source]) => ({ name, source }));

    expect(jobSection(WORKFLOW, 'evals')).toMatch(EVALS_NEED_RESOLVE_RE);
    expect(outputs).toStrictEqual(
      MODEL_INTENTS.map((intent) => ({ name: intent, source: intent }))
    );
  });

  it('ends the resolve job green when the served models cannot be read, so the legs fall back', () => {
    const scripts = runScripts(jobSection(WORKFLOW, 'resolve'));

    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(UNSET_SECRETS_EXIT_RE);
    expect(scripts[0]).toMatch(GUARDED_ACTIVE_READ_RE);
    expect(scripts[0]).not.toMatch(FAILING_EXIT_RE);
  });

  it('accepts every served model id, alias pins included, and nothing that could break an output line', () => {
    const pattern = servedModelPattern();
    const accepted = [
      ...Object.values(PLATFORM_SEED_MODELS),
      REFERENCE_MODEL,
      ALIAS_PIN,
    ];

    expect(accepted.filter((id) => !pattern.test(id))).toStrictEqual([]);
    expect(
      [NEWLINE_INJECTION, TRAILING_NEWLINE, ''].filter((id) => pattern.test(id))
    ).toStrictEqual([]);
  });

  it('never interpolates an expression inside run', () => {
    const scripts = runScripts(WORKFLOW);

    expect(scripts.length).toBeGreaterThan(0);
    expect(
      scripts.filter((script) => script.includes(EXPRESSION_OPEN))
    ).toStrictEqual([]);
  });

  it('runs only targets whose expected suites are known, so a missing summary is noticed', () => {
    const targets = [...WORKFLOW.matchAll(LEG_TARGET_RE)].map(
      ([, target]) => target
    );

    expect(targets.length).toBeGreaterThan(0);
    expect(
      targets.filter(
        (target) => !Object.hasOwn(EVAL_TARGET_SUITES, target ?? '')
      )
    ).toStrictEqual([]);
  });

  it.each(Object.values(EVAL_TARGET_SUITES).flat())(
    'keeps the %s suite writing its summary under the name the targets expect',
    (suite) => {
      const source = readFileSync(
        join(REPO_ROOT, `apps/api/src/modules/agent/eval/${suite}.eval.ts`),
        'utf8'
      );

      expect(source).toContain(`prepareEvalOutput('${suite}')`);
    }
  );

  it('expects a summary from every suite that writes one', () => {
    const writers = readdirSync(EVAL_DIR)
      .filter((name) => name.endsWith('.eval.ts'))
      .flatMap((name) => [
        ...readFileSync(join(EVAL_DIR, name), 'utf8').matchAll(
          SUMMARY_WRITER_RE
        ),
      ])
      .map(([, suite]) => suite)
      .sort();

    expect(writers).toStrictEqual([...EVAL_TARGET_SUITES.eval].sort());
  });

  it("compares each leg with earlier main runs of the artifact it uploads, per its target's suites", () => {
    const [, artifact] = WORKFLOW.match(DRIFT_STEP_RE) ?? [];
    const [, uploaded] = WORKFLOW.match(UPLOAD_NAME_RE) ?? [];

    expect(artifact).toBeDefined();
    expect(artifact).toBe(uploaded);
  });

  it('fails an eval run that collects no suite at all', () => {
    expect(EVAL_CONFIG).toMatch(NO_TESTS_FAIL_RE);
  });

  it('narrows the security target to a category the suite knows', () => {
    const [, category] = PROJECT.match(SECURITY_TARGET_CATEGORY_RE) ?? [];

    expect(EVAL_CATEGORIES).toContain(category);
    expect(category).toBe('security');
  });
});
