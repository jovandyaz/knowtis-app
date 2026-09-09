import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { artifactsApi } from '@knowtis/api-client';
import type {
  FlashcardProgress,
  StudySession,
  StudyStats,
} from '@knowtis/shared-types';

import {
  artifactsQueryKeys,
  useLatestQuizAttempt,
  useReviewCard,
  useStudySession,
  useStudyStats,
} from './artifacts.hooks';

vi.mock('@knowtis/api-client', () => ({
  artifactsApi: {
    getStudySession: vi.fn(),
    getStudyStats: vi.fn(),
    getLatestQuizAttempt: vi.fn(),
    reviewCard: vi.fn(),
  },
}));

const TIME_ZONE = 'America/Mexico_City';

const STATS: StudyStats = {
  dueCount: 2,
  newCount: 5,
  reviewedToday: 1,
  currentStreak: 1,
  totalCardsStudied: 1,
  nextDueAt: null,
};

const SESSION: StudySession = { cards: [], stats: STATS };

const PROGRESS: FlashcardProgress = {
  artifactId: 'deck-1',
  cardIndex: 2,
  easeFactor: 2.5,
  intervalDays: 6,
  repetitions: 2,
  nextReview: '2026-09-13T00:00:00.000Z',
};

describe('artifacts study hooks', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
  });

  it('nests the session, stats and latest-attempt keys under their parents', () => {
    expect(artifactsQueryKeys.studySession(TIME_ZONE)).toEqual([
      ...artifactsQueryKeys.study(),
      'session',
      TIME_ZONE,
    ]);
    expect(artifactsQueryKeys.studyStats(TIME_ZONE)).toEqual([
      ...artifactsQueryKeys.study(),
      'stats',
      TIME_ZONE,
    ]);
    expect(artifactsQueryKeys.latestQuizAttempt('quiz-1')).toEqual([
      ...artifactsQueryKeys.quizAttempts('quiz-1'),
      'latest',
    ]);
  });

  it('fetches the study session for the given time zone', async () => {
    vi.mocked(artifactsApi.getStudySession).mockResolvedValue(SESSION);

    const { result } = renderHook(() => useStudySession(TIME_ZONE), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(artifactsApi.getStudySession).toHaveBeenCalledTimes(1);
    expect(artifactsApi.getStudySession).toHaveBeenCalledWith(TIME_ZONE);
    expect(result.current.data).toEqual(SESSION);
  });

  it('fetches the study stats for the given time zone', async () => {
    vi.mocked(artifactsApi.getStudyStats).mockResolvedValue(STATS);

    const { result } = renderHook(() => useStudyStats(TIME_ZONE), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(artifactsApi.getStudyStats).toHaveBeenCalledWith(TIME_ZONE);
    expect(result.current.data).toEqual(STATS);
  });

  it('does not request the latest attempt until an artifact id exists', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | undefined }) => useLatestQuizAttempt(id),
      { wrapper, initialProps: { id: undefined as string | undefined } }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(artifactsApi.getLatestQuizAttempt).not.toHaveBeenCalled();

    vi.mocked(artifactsApi.getLatestQuizAttempt).mockResolvedValue({
      latest: null,
    });
    rerender({ id: 'quiz-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(artifactsApi.getLatestQuizAttempt).toHaveBeenCalledWith('quiz-1');
    expect(result.current.data).toEqual({ latest: null });
  });

  it('refreshes a mounted study-stats query after a review', async () => {
    vi.mocked(artifactsApi.getStudyStats).mockResolvedValue(STATS);
    vi.mocked(artifactsApi.reviewCard).mockResolvedValue(PROGRESS);
    const { result: stats } = renderHook(() => useStudyStats(TIME_ZONE), {
      wrapper,
    });
    await waitFor(() => expect(stats.current.isSuccess).toBe(true));

    const reviewed: StudyStats = { ...STATS, dueCount: 1, reviewedToday: 2 };
    vi.mocked(artifactsApi.getStudyStats).mockResolvedValue(reviewed);
    const { result } = renderHook(() => useReviewCard(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        artifactId: 'deck-1',
        cardIndex: 2,
        quality: 5,
      });
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryData(artifactsQueryKeys.studyStats(TIME_ZONE))
      ).toEqual(reviewed)
    );
    expect(artifactsApi.getStudyStats).toHaveBeenCalledTimes(2);
  });

  it('marks the study session stale without refetching the snapshot in play', async () => {
    vi.mocked(artifactsApi.getStudySession).mockResolvedValue(SESSION);
    vi.mocked(artifactsApi.reviewCard).mockResolvedValue(PROGRESS);
    const { result: session } = renderHook(() => useStudySession(TIME_ZONE), {
      wrapper,
    });
    await waitFor(() => expect(session.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useReviewCard(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        artifactId: 'deck-1',
        cardIndex: 2,
        quality: 5,
      });
    });

    expect(artifactsApi.getStudySession).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryState(artifactsQueryKeys.studySession(TIME_ZONE))
        ?.isInvalidated
    ).toBe(true);
  });

  it('posts a review positionally and invalidates every artifacts query', async () => {
    vi.mocked(artifactsApi.reviewCard).mockResolvedValue(PROGRESS);
    const seeded = [
      artifactsQueryKeys.progress('deck-1'),
      artifactsQueryKeys.studySession(TIME_ZONE),
      artifactsQueryKeys.studyStats(TIME_ZONE),
      artifactsQueryKeys.byNote('note-1'),
    ];
    for (const key of seeded) {
      queryClient.setQueryData(key, {});
    }

    const { result } = renderHook(() => useReviewCard(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        artifactId: 'deck-1',
        cardIndex: 2,
        quality: 5,
      });
    });

    expect(artifactsApi.reviewCard).toHaveBeenCalledWith('deck-1', {
      cardIndex: 2,
      quality: 5,
    });
    for (const key of seeded) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
