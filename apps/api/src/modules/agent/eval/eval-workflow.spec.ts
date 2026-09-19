import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AI_SETTING_DEFAULTS } from '../../ai/domain/ai-settings';
import { EVAL_CATEGORIES } from './cases';

const REPO_ROOT = join(__dirname, '../../../../../..');
const WORKFLOW = readFileSync(
  join(REPO_ROOT, '.github/workflows/nightly-eval.yml'),
  'utf8'
);
const PROJECT = readFileSync(join(REPO_ROOT, 'apps/api/project.json'), 'utf8');
const SECURITY_TARGET_CATEGORY_RE =
  /"eval-security": \{[^}]*?"env": \{ "AI_EVAL_CATEGORY": "(\w+)" \}/s;
const LEG_RE =
  /^ +- leg: (\S+)\n +model: (.+)\n +target: (\S+)\n +trials: (\d+)$/gm;
const LEG_START_RE = /^ +- leg: /gm;
const REFERENCE_MODEL = 'anthropic:claude-sonnet-5';
const BEHAVIOR_TRIALS = '3';
const SECURITY_TRIALS = '10';

function overridable(repositoryVariable: string, codeDefault: string): string {
  return `\${{ vars.${repositoryVariable} || '${codeDefault}' }}`;
}

describe('weekly eval workflow', () => {
  it('runs exactly these legs, each production model falling back to its code default', () => {
    const defaultModel = overridable(
      'AI_EVAL_DEFAULT_MODEL',
      AI_SETTING_DEFAULTS.ai_default_model
    );
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
        model: overridable(
          'AI_EVAL_FAST_MODEL',
          AI_SETTING_DEFAULTS.ai_fast_model
        ),
        target: 'eval-security',
        trials: SECURITY_TRIALS,
      },
      {
        leg: 'deep-model-security',
        model: overridable(
          'AI_EVAL_DEEP_MODEL',
          AI_SETTING_DEFAULTS.ai_deep_model
        ),
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

  it('narrows the security target to a category the suite knows', () => {
    const [, category] = PROJECT.match(SECURITY_TARGET_CATEGORY_RE) ?? [];

    expect(EVAL_CATEGORIES).toContain(category);
    expect(category).toBe('security');
  });
});
