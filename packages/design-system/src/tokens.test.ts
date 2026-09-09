import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readJson(relative: string) {
  return JSON.parse(
    readFileSync(resolve(import.meta.dirname, '..', relative), 'utf8')
  );
}

const learn = readJson('tokens/learn.json');
const LEARN_TOKENS: string[] = Object.keys(learn.color.semantic.light);
const THEMES = ['light', 'dark'] as const;

// Prettier wraps long custom-property declarations, so compare without whitespace.
const compact = (css: string) => css.replace(/\s+/g, '');
const styles = compact(
  readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8')
);

function expectDeclaration(declaration: string) {
  expect(styles).toContain(compact(declaration));
}

describe('learning colour tokens', () => {
  it('defines the same token names in both themes', () => {
    expect(Object.keys(learn.color.semantic.dark).sort()).toEqual(
      [...LEARN_TOKENS].sort()
    );
  });

  it.each(THEMES)(
    'resolves every learn token of the %s theme to a primitive',
    (theme) => {
      const semantic = learn.color.semantic[theme];
      for (const token of LEARN_TOKENS) {
        expect(semantic[token]).toEqual({
          value: expect.stringMatching(/^\{color\.primitive\./),
          type: 'color',
        });
      }
    }
  );

  it.each(LEARN_TOKENS)('exposes %s to Tailwind and both themes', (token) => {
    expectDeclaration(`--color-${token}: var(--${token});`);
    expectDeclaration(`--${token}: var(--color-semantic-light-${token});`);
    expectDeclaration(`--${token}: var(--color-semantic-dark-${token});`);
  });
});
