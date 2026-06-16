import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from './compose-system-prompt';

describe('composeSystemPrompt', () => {
  it('injects user memories as DATA, not instructions', () => {
    const out = composeSystemPrompt(undefined, undefined, [
      'Is vegan',
      'Prefers concise replies',
    ]);
    expect(out).toContain('Is vegan');
    expect(out).toContain('Prefers concise replies');
    expect(out.toLowerCase()).toContain('data');
  });

  it('omits the memory block when there are none', () => {
    const out = composeSystemPrompt(undefined, undefined, []);
    expect(out).not.toContain('durably know');
  });
});
