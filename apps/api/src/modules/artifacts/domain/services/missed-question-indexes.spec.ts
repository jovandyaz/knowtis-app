import { describe, expect, it } from 'vitest';

import { missedQuestionIndexes } from './missed-question-indexes';

describe('missedQuestionIndexes', () => {
  it('collects the incorrect question indexes in ascending order', () => {
    const result = missedQuestionIndexes([
      { questionIndex: 2, correct: false },
      { questionIndex: 0, correct: true },
      { questionIndex: 1, correct: false },
    ]);

    expect(result).toEqual([1, 2]);
  });

  it('deduplicates a legacy attempt that answered the same question twice', () => {
    const result = missedQuestionIndexes([
      { questionIndex: 1, correct: false },
      { questionIndex: 1, correct: false },
      { questionIndex: 2, correct: true },
    ]);

    expect(result).toEqual([1]);
  });

  it('returns an empty array when nothing was missed', () => {
    const result = missedQuestionIndexes([{ questionIndex: 0, correct: true }]);

    expect(result).toEqual([]);
  });
});
