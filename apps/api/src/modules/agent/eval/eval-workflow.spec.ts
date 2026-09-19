import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AI_SETTING_DEFAULTS } from '../../ai/domain/ai-settings';

const WORKFLOW = readFileSync(
  join(__dirname, '../../../../../../.github/workflows/nightly-eval.yml'),
  'utf8'
);
const MODEL_FALLBACK_RE = /vars\.(AI_EVAL_\w+_MODEL) \|\| '([^']+)'/g;

describe('weekly eval workflow', () => {
  it('pins every production leg to the code default its repository variable overrides', () => {
    const fallbacks = [...WORKFLOW.matchAll(MODEL_FALLBACK_RE)].map(
      ([, repositoryVariable, model]) => [repositoryVariable, model]
    );

    expect(fallbacks).toStrictEqual([
      ['AI_EVAL_DEFAULT_MODEL', AI_SETTING_DEFAULTS.ai_default_model],
      ['AI_EVAL_DEFAULT_MODEL', AI_SETTING_DEFAULTS.ai_default_model],
      ['AI_EVAL_FAST_MODEL', AI_SETTING_DEFAULTS.ai_fast_model],
      ['AI_EVAL_DEEP_MODEL', AI_SETTING_DEFAULTS.ai_deep_model],
    ]);
  });
});
