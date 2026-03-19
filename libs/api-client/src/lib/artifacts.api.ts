import type {
  Artifact,
  ArtifactType,
  FlashcardProgress,
  QuizAttempt,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

export interface GenerateArtifactInput {
  noteId: string;
  type: ArtifactType;
}

export interface LearnTopicInput {
  topic: string;
}

export interface ReviewCardInput {
  cardIndex: number;
  quality: number;
}

export interface SubmitQuizInput {
  answers: { questionIndex: number; selectedIndex: number }[];
}

export interface DueCard {
  artifactId: string;
  cardIndex: number;
  artifactTitle: string;
}

export const artifactsApi = {
  async getAll(noteId?: string): Promise<Artifact[]> {
    const params = noteId ? `?noteId=${noteId}` : '';
    return httpClient.get<Artifact[]>(`/artifacts${params}`);
  },

  async getById(id: string): Promise<Artifact> {
    return httpClient.get<Artifact>(`/artifacts/${id}`);
  },

  async generate(input: GenerateArtifactInput): Promise<Artifact> {
    return httpClient.post<Artifact>('/artifacts/generate', input);
  },

  async learnTopic(
    input: LearnTopicInput
  ): Promise<{ title: string; content: string }> {
    return httpClient.post<{ title: string; content: string }>(
      '/artifacts/learn',
      input
    );
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

  async getDueCards(): Promise<DueCard[]> {
    return httpClient.get<DueCard[]>('/artifacts/study/due');
  },
};
