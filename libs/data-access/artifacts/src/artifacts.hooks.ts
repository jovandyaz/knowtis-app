import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { artifactsApi } from '@knowtis/api-client';
import type {
  GenerateArtifactInput,
  ReviewCardInput,
  SubmitQuizInput,
} from '@knowtis/api-client';

const STALE_TIME = {
  SHORT: 1000 * 30,
  DEFAULT: 1000 * 60,
  LONG: 1000 * 60 * 5,
} as const;

export const artifactsQueryKeys = {
  all: ['artifacts'] as const,
  byNote: (noteId: string) =>
    [...artifactsQueryKeys.all, 'note', noteId] as const,
  detail: (id: string) => [...artifactsQueryKeys.all, 'detail', id] as const,
  progress: (id: string) =>
    [...artifactsQueryKeys.all, 'progress', id] as const,
  quizAttempts: (id: string) =>
    [...artifactsQueryKeys.all, 'quiz-attempts', id] as const,
  latestQuizAttempt: (id: string) =>
    [...artifactsQueryKeys.all, 'quiz-attempts', id, 'latest'] as const,
  study: () => [...artifactsQueryKeys.all, 'study'] as const,
  studySession: (timeZone: string) =>
    [...artifactsQueryKeys.study(), 'session', timeZone] as const,
  studyStats: (timeZone: string) =>
    [...artifactsQueryKeys.study(), 'stats', timeZone] as const,
  shared: (token: string) =>
    [...artifactsQueryKeys.all, 'shared', token] as const,
} as const;

function requireArtifactId(artifactId: string | undefined): string {
  if (!artifactId) {
    throw new Error('artifactId is required');
  }
  return artifactId;
}

export function useArtifacts(noteId?: string) {
  return useQuery({
    queryKey: noteId
      ? artifactsQueryKeys.byNote(noteId)
      : artifactsQueryKeys.all,
    queryFn: () => artifactsApi.getAll(noteId),
    enabled: !!noteId,
    staleTime: STALE_TIME.DEFAULT,
  });
}

export function useArtifact(id: string | undefined) {
  return useQuery({
    queryKey: artifactsQueryKeys.detail(id ?? ''),
    queryFn: () => artifactsApi.getById(requireArtifactId(id)),
    enabled: !!id,
    staleTime: STALE_TIME.SHORT,
  });
}

export function useGenerateArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GenerateArtifactInput) => artifactsApi.generate(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: artifactsQueryKeys.all });
    },
  });
}

export function useDeleteArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => artifactsApi.delete(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: artifactsQueryKeys.all });
    },
  });
}

export function useFlashcardProgress(artifactId: string | undefined) {
  return useQuery({
    queryKey: artifactsQueryKeys.progress(artifactId ?? ''),
    queryFn: () => artifactsApi.getProgress(requireArtifactId(artifactId)),
    enabled: !!artifactId,
  });
}

export interface ReviewCardVariables extends ReviewCardInput {
  artifactId: string;
}

export function useReviewCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ artifactId, ...input }: ReviewCardVariables) =>
      artifactsApi.reviewCard(artifactId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: artifactsQueryKeys.all });
    },
  });
}

export function useSubmitQuiz(artifactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubmitQuizInput) =>
      artifactsApi.submitQuiz(artifactId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: artifactsQueryKeys.all });
    },
  });
}

export function useQuizAttempts(artifactId: string | undefined) {
  return useQuery({
    queryKey: artifactsQueryKeys.quizAttempts(artifactId ?? ''),
    queryFn: () => artifactsApi.getQuizAttempts(requireArtifactId(artifactId)),
    enabled: !!artifactId,
  });
}

export function useLatestQuizAttempt(artifactId: string | undefined) {
  return useQuery({
    queryKey: artifactsQueryKeys.latestQuizAttempt(artifactId ?? ''),
    queryFn: () =>
      artifactsApi.getLatestQuizAttempt(requireArtifactId(artifactId)),
    enabled: !!artifactId,
    staleTime: STALE_TIME.SHORT,
  });
}

export function useStudySession(timeZone: string) {
  return useQuery({
    queryKey: artifactsQueryKeys.studySession(timeZone),
    queryFn: () => artifactsApi.getStudySession(timeZone),
    staleTime: STALE_TIME.SHORT,
  });
}

export interface UseStudyStatsOptions {
  enabled?: boolean;
}

export function useStudyStats(
  timeZone: string,
  { enabled = true }: UseStudyStatsOptions = {}
) {
  return useQuery({
    queryKey: artifactsQueryKeys.studyStats(timeZone),
    queryFn: () => artifactsApi.getStudyStats(timeZone),
    staleTime: STALE_TIME.DEFAULT,
    enabled,
  });
}

export function useSharedNoteArtifacts(token: string) {
  return useQuery({
    queryKey: artifactsQueryKeys.shared(token),
    queryFn: () => artifactsApi.getByShareToken(token),
    enabled: !!token,
    staleTime: STALE_TIME.LONG,
  });
}
