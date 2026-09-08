import { describe, expect, it } from 'vitest';

import { answerLetter } from './answer-option';

describe('answerLetter', () => {
  it('letters the first option A', () => {
    expect(answerLetter(0)).toBe('A');
  });

  it('letters the twenty-sixth option Z', () => {
    expect(answerLetter(25)).toBe('Z');
  });
});
