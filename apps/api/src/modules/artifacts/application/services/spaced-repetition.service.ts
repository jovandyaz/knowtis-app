interface SM2Input {
  quality: number;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
}

export interface SM2Output {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReview: Date;
}

const MIN_EASE_FACTOR = 1.3;
const INITIAL_EASE_FACTOR = 2.5;
const SM2_PASS_THRESHOLD = 3;
const FIRST_CORRECT_INTERVAL_DAYS = 1;
const SECOND_CORRECT_INTERVAL_DAYS = 6;

export function initializeProgress() {
  return {
    easeFactor: INITIAL_EASE_FACTOR,
    intervalDays: 0,
    repetitions: 0,
  };
}

export function calculateNextReview(input: SM2Input): SM2Output {
  const { quality, repetitions, easeFactor, intervalDays } = input;

  if (quality < SM2_PASS_THRESHOLD) {
    return {
      repetitions: 0,
      easeFactor,
      intervalDays: FIRST_CORRECT_INTERVAL_DAYS,
      nextReview: addDays(new Date(), FIRST_CORRECT_INTERVAL_DAYS),
    };
  }

  let newInterval: number;

  if (repetitions === 0) {
    newInterval = FIRST_CORRECT_INTERVAL_DAYS;
  } else if (repetitions === 1) {
    newInterval = SECOND_CORRECT_INTERVAL_DAYS;
  } else {
    newInterval = Math.round(intervalDays * easeFactor);
  }

  const newEaseFactor = Math.max(
    MIN_EASE_FACTOR,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  return {
    repetitions: repetitions + 1,
    easeFactor: Math.round(newEaseFactor * 100) / 100,
    intervalDays: newInterval,
    nextReview: addDays(new Date(), newInterval),
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
