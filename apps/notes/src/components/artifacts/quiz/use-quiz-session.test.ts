import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { QuizContent } from '@knowtis/shared-types';

import { useQuizSession } from './use-quiz-session';

const questions: QuizContent['questions'] = [
  {
    question: 'One?',
    options: ['One', 'Two'],
    correctIndex: 0,
    explanation: '',
  },
  {
    question: 'Two?',
    options: ['Two', 'Three'],
    correctIndex: 0,
    explanation: '',
  },
  {
    question: 'Three?',
    options: ['Two', 'Three'],
    correctIndex: 1,
    explanation: '',
  },
];

describe('useQuizSession', () => {
  it('allows editing selection without grading until checked', () => {
    const { result } = renderHook(() => useQuizSession(questions));
    act(() => result.current.select(0));
    act(() => result.current.select(1));
    expect(result.current.selectedOption).toBe(1);
    expect(result.current.checked).toBe(false);
    expect(result.current.answers).toEqual([]);
    expect(result.current.score).toBe(0);
  });

  it('records a checked answer once and locks selection', () => {
    const { result } = renderHook(() => useQuizSession(questions));
    act(() => result.current.select(0));
    act(() => result.current.check());
    act(() => {
      result.current.select(1);
      result.current.check();
    });
    expect(result.current.checked).toBe(true);
    expect(result.current.selectedOption).toBe(0);
    expect(result.current.answers).toEqual([
      { questionIndex: 0, selectedIndex: 0, correct: true },
    ]);
    expect(result.current.score).toBe(1);
  });

  it('does not check or advance without a checked selection', () => {
    const { result } = renderHook(() => useQuizSession(questions));
    act(() => {
      result.current.check();
      result.current.next();
    });
    expect(result.current.checked).toBe(false);
    expect(result.current.answers).toEqual([]);
    expect(result.current.position).toBe(0);
    act(() => {
      result.current.select(0);
      result.current.next();
    });
    expect(result.current.position).toBe(0);
  });

  it('clears selection on advance and completes only after final feedback', () => {
    const { result } = renderHook(() => useQuizSession(questions.slice(0, 2)));
    act(() => result.current.select(0));
    act(() => result.current.check());
    act(() => result.current.next());
    expect(result.current.currentQuestion).toEqual(questions[1]);
    expect(result.current.currentQuestionIndex).toBe(1);
    expect(result.current.position).toBe(1);
    expect(result.current.selectedOption).toBeNull();
    expect(result.current.checked).toBe(false);
    expect(result.current.isLast).toBe(true);
    act(() => result.current.select(1));
    act(() => result.current.check());
    expect(result.current.completed).toBe(false);
    act(() => result.current.next());
    expect(result.current.completed).toBe(true);
    expect(result.current.score).toBe(1);
    expect(result.current.total).toBe(2);
    expect(result.current.missedIndexes).toEqual([1]);
  });

  it('retries only the current run misses at their original indexes', () => {
    const { result } = renderHook(() => useQuizSession(questions));
    for (const option of [0, 1, 0]) {
      act(() => result.current.select(option));
      act(() => result.current.check());
      act(() => result.current.next());
    }
    act(() => result.current.retryMissed());
    expect(result.current.scope).toBe('missed');
    expect(result.current.activeIndexes).toEqual([1, 2]);
    expect(result.current.currentQuestionIndex).toBe(1);
    expect(result.current.total).toBe(2);
    expect(result.current.answers).toEqual([]);
    expect(result.current.score).toBe(0);
    expect(result.current.completed).toBe(false);
    for (const option of [0, 0]) {
      act(() => result.current.select(option));
      act(() => result.current.check());
      act(() => result.current.next());
    }
    expect(result.current.answers).toEqual([
      { questionIndex: 1, selectedIndex: 0, correct: true },
      { questionIndex: 2, selectedIndex: 0, correct: false },
    ]);
    act(() => result.current.retryMissed());
    expect(result.current.activeIndexes).toEqual([2]);
    expect(result.current.currentQuestionIndex).toBe(2);
  });

  it('restarts the full quiz after a missed-question run', () => {
    const { result } = renderHook(() => useQuizSession(questions.slice(0, 1)));
    act(() => result.current.select(1));
    act(() => result.current.check());
    act(() => result.current.next());
    act(() => result.current.retryMissed());
    act(() => result.current.restart());
    expect(result.current.scope).toBe('full');
    expect(result.current.activeIndexes).toEqual([0]);
    expect(result.current.position).toBe(0);
    expect(result.current.selectedOption).toBeNull();
    expect(result.current.checked).toBe(false);
    expect(result.current.answers).toEqual([]);
    expect(result.current.completed).toBe(false);
  });

  it('indexes questionStatuses by the current run position, including noncontiguous retries', () => {
    const prompts = [0, 1, 2].map((index) => ({
      question: `Question ${index}`,
      options: ['Right', 'Wrong'],
      correctIndex: 0,
      explanation: '',
    }));
    const { result } = renderHook(() => useQuizSession(prompts));
    expect(result.current.questionStatuses).toEqual([
      'unanswered',
      'unanswered',
      'unanswered',
    ]);
    act(() => result.current.select(1));
    expect(result.current.questionStatuses).toEqual([
      'unanswered',
      'unanswered',
      'unanswered',
    ]);
    act(() => result.current.check());
    expect(result.current.questionStatuses).toEqual([
      'incorrect',
      'unanswered',
      'unanswered',
    ]);
    act(() => result.current.next());
    act(() => result.current.select(0));
    act(() => result.current.check());
    act(() => result.current.next());
    act(() => result.current.select(1));
    act(() => result.current.check());
    act(() => result.current.next());
    expect(result.current.questionStatuses).toEqual([
      'incorrect',
      'correct',
      'incorrect',
    ]);
    act(() => result.current.retryMissed());
    expect(result.current.activeIndexes).toEqual([0, 2]);
    expect(result.current.questionStatuses).toEqual([
      'unanswered',
      'unanswered',
    ]);
    act(() => result.current.select(0));
    act(() => result.current.check());
    act(() => result.current.next());
    expect(result.current.currentQuestionIndex).toBe(2);
    expect(result.current.questionStatuses).toEqual(['correct', 'unanswered']);
    act(() => result.current.restart());
    expect(result.current.questionStatuses).toEqual([
      'unanswered',
      'unanswered',
      'unanswered',
    ]);
  });

  it('leaves a perfect result intact when there are no misses to retry', () => {
    const { result } = renderHook(() => useQuizSession(questions.slice(0, 1)));
    act(() => result.current.select(0));
    act(() => result.current.check());
    act(() => result.current.next());
    act(() => result.current.retryMissed());
    expect(result.current.completed).toBe(true);
    expect(result.current.scope).toBe('full');
    expect(result.current.score).toBe(1);
  });

  it.each([-1, 2, 0.5])('ignores invalid option index %s', (index) => {
    const { result } = renderHook(() => useQuizSession(questions));
    act(() => result.current.select(index));
    act(() => result.current.check());
    expect(result.current.selectedOption).toBeNull();
    expect(result.current.answers).toEqual([]);
  });
});
