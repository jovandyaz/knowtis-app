import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const LEARN_TOKENS = [
  'learn-correct',
  'learn-incorrect',
  'learn-new',
  'learn-difficulty-easy',
  'learn-difficulty-medium',
  'learn-difficulty-hard',
] as const;

const THEMES = ['light', 'dark'] as const;

function readJson(relative: string) {
  return JSON.parse(
    readFileSync(resolve(import.meta.dirname, '..', relative), 'utf8')
  );
}

describe('learning colour tokens', () => {
  const learn = readJson('tokens/learn.json');
  const styles = readFileSync(
    resolve(import.meta.dirname, 'styles.css'),
    'utf8'
  );

  it.each(THEMES)('defines every learn token for the %s theme', (theme) => {
    const semantic = learn.color.semantic[theme];
    for (const token of LEARN_TOKENS) {
      expect(semantic[token]).toEqual({
        value: expect.stringMatching(/^\{color\.primitive\./),
        type: 'color',
      });
    }
  });

  it.each(LEARN_TOKENS)('exposes %s to Tailwind and both themes', (token) => {
    expect(styles).toContain(`--color-${token}: var(--${token});`);
    expect(styles).toContain(
      `--${token}: var(--color-semantic-light-${token});`
    );
    expect(styles).toContain(
      `--${token}: var(--color-semantic-dark-${token});`
    );
  });
});
