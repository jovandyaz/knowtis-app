import { describe, expect, it } from 'vitest';

import { ATTACK_CORPUS, BENIGN_CORPUS } from './injection-corpus';
import { detectPromptInjection } from './prompt-guard';

describe('injection corpus (CI gate)', () => {
  it.each(ATTACK_CORPUS)('flags attack: %s', (text) => {
    expect(detectPromptInjection(text).safe).toBe(false);
  });

  it.each(BENIGN_CORPUS)('keeps benign content safe: %s', (text) => {
    expect(detectPromptInjection(text).safe).toBe(true);
  });
});
