import type {
  Artifact,
  ArtifactType,
  ArtifactWithStudyState,
  FlashcardProgress,
  LatestQuizAttemptResponse,
  QuizAttempt,
  QuizAttemptScope,
  SM2Quality,
  StudySession,
  StudyStats,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

export interface GenerateArtifactInput {
  noteId: string;
  type: ArtifactType;
}

export interface ReviewCardInput {
  cardIndex: number;
  quality: SM2Quality;
}

export interface SubmitQuizInput {
  answers: { questionIndex: number; selectedIndex: number }[];
  scope?: QuizAttemptScope;
}

function studyQuery(timeZone: string): string {
  return timeZone ? `?tz=${encodeURIComponent(timeZone)}` : '';
}

export const artifactsApi = {
  async getAll(noteId?: string): Promise<ArtifactWithStudyState[]> {
    const params = noteId ? `?noteId=${encodeURIComponent(noteId)}` : '';
    return httpClient.get<ArtifactWithStudyState[]>(`/artifacts${params}`);
  },

  async getById(id: string): Promise<Artifact> {
    return httpClient.get<Artifact>(`/artifacts/${id}`);
  },

  async generate(input: GenerateArtifactInput): Promise<Artifact> {
    return httpClient.post<Artifact>('/artifacts/generate', input);
  },

  async delete(id: string): Promise<void> {
    await httpClient.delete(`/artifacts/${id}`);
  },

  async getProgress(artifactId: string): Promise<FlashcardProgress[]> {
    return httpClient.get<FlashcardProgress[]>(
      `/artifacts/${artifactId}/progress`
    );
  },

  async reviewCard(
    artifactId: string,
    input: ReviewCardInput
  ): Promise<FlashcardProgress> {
    return httpClient.post<FlashcardProgress>(
      `/artifacts/${artifactId}/review`,
      input
    );
  },

  async submitQuiz(
    artifactId: string,
    input: SubmitQuizInput
  ): Promise<QuizAttempt> {
    return httpClient.post<QuizAttempt>(
      `/artifacts/${artifactId}/quiz-attempt`,
      input
    );
  },

  async getQuizAttempts(artifactId: string): Promise<QuizAttempt[]> {
    return httpClient.get<QuizAttempt[]>(
      `/artifacts/${artifactId}/quiz-attempts`
    );
  },

  async getLatestQuizAttempt(
    artifactId: string
  ): Promise<LatestQuizAttemptResponse> {
    return httpClient.get<LatestQuizAttemptResponse>(
      `/artifacts/${artifactId}/quiz-attempts/latest`
    );
  },

  async getStudySession(timeZone: string): Promise<StudySession> {
    return httpClient.get<StudySession>(
      `/artifacts/study/session${studyQuery(timeZone)}`
    );
  },

  async getStudyStats(timeZone: string): Promise<StudyStats> {
    return httpClient.get<StudyStats>(
      `/artifacts/study/stats${studyQuery(timeZone)}`
    );
  },

  async getByShareToken(token: string): Promise<Artifact[]> {
    return httpClient.get<Artifact[]>(`/notes/shared/${token}/artifacts`, {
      skipAuth: true,
    });
  },
};
