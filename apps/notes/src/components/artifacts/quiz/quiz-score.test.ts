import { describe, expect, it } from 'vitest';

import { scoreTone } from './quiz-score';

describe('scoreTone', () => {
  it('reads a score of seventy or more as correct', () => {
    expect(scoreTone(70)).toBe('correct');
    expect(scoreTone(100)).toBe('correct');
  });

  it('reads a score from forty to sixty-nine as the neutral primary tone', () => {
    expect(scoreTone(40)).toBe('primary');
    expect(scoreTone(69)).toBe('primary');
  });

  it('reads a score under forty as incorrect', () => {
    expect(scoreTone(39)).toBe('incorrect');
    expect(scoreTone(0)).toBe('incorrect');
  });
});
