import { describe, expect, it } from 'vitest';

import {
  calculateNextReview,
  initializeProgress,
  predictIntervals,
} from './spaced-repetition.service';

describe('SpacedRepetitionService', () => {
  describe('initializeProgress', () => {
    it('should return default values for a new card', () => {
      const progress = initializeProgress();
      expect(progress.easeFactor).toBe(2.5);
      expect(progress.intervalDays).toBe(0);
      expect(progress.repetitions).toBe(0);
    });
  });

  describe('calculateNextReview', () => {
    it('should reset on quality < 3', () => {
      const result = calculateNextReview({
        quality: 1,
        repetitions: 5,
        easeFactor: 2.5,
        intervalDays: 30,
      });
      expect(result.repetitions).toBe(0);
      expect(result.intervalDays).toBe(1);
    });

    it('should set interval to 1 day on first correct answer', () => {
      const result = calculateNextReview({
        quality: 4,
        repetitions: 0,
        easeFactor: 2.5,
        intervalDays: 0,
      });
      expect(result.repetitions).toBe(1);
      expect(result.intervalDays).toBe(1);
    });

    it('should set interval to 6 days on second correct answer', () => {
      const result = calculateNextReview({
        quality: 4,
        repetitions: 1,
        easeFactor: 2.5,
        intervalDays: 1,
      });
      expect(result.repetitions).toBe(2);
      expect(result.intervalDays).toBe(6);
    });

    it('should multiply interval by ease factor after second repetition', () => {
      const result = calculateNextReview({
        quality: 4,
        repetitions: 2,
        easeFactor: 2.5,
        intervalDays: 6,
      });
      expect(result.repetitions).toBe(3);
      expect(result.intervalDays).toBe(15);
    });

    it('should decrease ease factor on quality 3', () => {
      const result = calculateNextReview({
        quality: 3,
        repetitions: 3,
        easeFactor: 2.5,
        intervalDays: 15,
      });
      expect(result.easeFactor).toBeLessThan(2.5);
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should not let ease factor go below 1.3', () => {
      const result = calculateNextReview({
        quality: 3,
        repetitions: 3,
        easeFactor: 1.3,
        intervalDays: 10,
      });
      expect(result.easeFactor).toBe(1.3);
    });

    it('should return a nextReview date in the future', () => {
      const result = calculateNextReview({
        quality: 5,
        repetitions: 2,
        easeFactor: 2.5,
        intervalDays: 6,
      });
      expect(result.nextReview.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('predictIntervals', () => {
    it('predicts 1 day for both failing ratings and the SM-2 ladder for passing ones on a new card', () => {
      const result = predictIntervals({
        repetitions: 0,
        easeFactor: 2.5,
        intervalDays: 0,
      });
      expect(result).toEqual({ again: 1, hard: 1, good: 1, easy: 1 });
    });

    it('predicts the second step for a card reviewed once', () => {
      const result = predictIntervals({
        repetitions: 1,
        easeFactor: 2.5,
        intervalDays: 1,
      });
      expect(result).toEqual({ again: 1, hard: 1, good: 6, easy: 6 });
    });

    it('scales by ease for a seasoned card', () => {
      const result = predictIntervals({
        repetitions: 3,
        easeFactor: 2.5,
        intervalDays: 6,
      });
      expect(result.again).toBe(1);
      expect(result.good).toBe(15);
      expect(result.easy).toBe(15);
    });
  });
});
