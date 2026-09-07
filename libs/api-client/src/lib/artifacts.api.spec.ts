import { beforeEach, describe, expect, it, vi } from 'vitest';

import { artifactsApi } from './artifacts.api';
import { httpClient } from './http-client';

vi.mock('./http-client', () => ({
  httpClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

describe('artifactsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStudySession', () => {
    it('omits the tz param when timeZone is empty', async () => {
      vi.mocked(httpClient.get).mockResolvedValue({});
      await artifactsApi.getStudySession('');
      expect(httpClient.get).toHaveBeenCalledWith('/artifacts/study/session');
    });

    it('encodes the tz param when timeZone is provided', async () => {
      vi.mocked(httpClient.get).mockResolvedValue({});
      await artifactsApi.getStudySession('America/Mexico_City');
      expect(httpClient.get).toHaveBeenCalledWith(
        '/artifacts/study/session?tz=America%2FMexico_City'
      );
    });
  });

  describe('getStudyStats', () => {
    it('omits the tz param when timeZone is empty', async () => {
      vi.mocked(httpClient.get).mockResolvedValue({});
      await artifactsApi.getStudyStats('');
      expect(httpClient.get).toHaveBeenCalledWith('/artifacts/study/stats');
    });

    it('encodes the tz param when timeZone is provided', async () => {
      vi.mocked(httpClient.get).mockResolvedValue({});
      await artifactsApi.getStudyStats('UTC');
      expect(httpClient.get).toHaveBeenCalledWith(
        '/artifacts/study/stats?tz=UTC'
      );
    });
  });

  describe('getAll', () => {
    it('hits GET /artifacts with no filter', async () => {
      vi.mocked(httpClient.get).mockResolvedValue({});
      await artifactsApi.getAll();
      expect(httpClient.get).toHaveBeenCalledWith('/artifacts');
    });

    it('encodes the noteId filter', async () => {
      vi.mocked(httpClient.get).mockResolvedValue({});
      await artifactsApi.getAll('note-1');
      expect(httpClient.get).toHaveBeenCalledWith('/artifacts?noteId=note-1');
    });
  });

  describe('reviewCard', () => {
    it('posts only cardIndex and quality, never artifactId', async () => {
      vi.mocked(httpClient.post).mockResolvedValue({});
      await artifactsApi.reviewCard('a-1', {
        cardIndex: 2,
        quality: 5,
      });
      expect(httpClient.post).toHaveBeenCalledWith('/artifacts/a-1/review', {
        cardIndex: 2,
        quality: 5,
      });
    });
  });

  describe('submitQuiz', () => {
    it('posts the quiz answers and scope', async () => {
      vi.mocked(httpClient.post).mockResolvedValue({});
      await artifactsApi.submitQuiz('a-1', {
        answers: [{ questionIndex: 0, selectedIndex: 1 }],
        scope: 'missed',
      });
      expect(httpClient.post).toHaveBeenCalledWith(
        '/artifacts/a-1/quiz-attempt',
        {
          answers: [{ questionIndex: 0, selectedIndex: 1 }],
          scope: 'missed',
        }
      );
    });
  });

  describe('getLatestQuizAttempt', () => {
    it('hits GET /artifacts/:id/quiz-attempts/latest', async () => {
      vi.mocked(httpClient.get).mockResolvedValue({});
      await artifactsApi.getLatestQuizAttempt('a-1');
      expect(httpClient.get).toHaveBeenCalledWith(
        '/artifacts/a-1/quiz-attempts/latest'
      );
    });
  });
});
