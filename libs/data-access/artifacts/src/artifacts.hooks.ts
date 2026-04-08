import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { artifactsApi } from '@knowtis/api-client';
import type {
  GenerateArtifactInput,
  ReviewCardInput,
  SubmitQuizInput,
} from '@knowtis/api-client';
import type { Artifact } from '@knowtis/shared-types';

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
  dueCards: () => [...artifactsQueryKeys.all, 'due'] as const,
  shared: (token: string) =>
    [...artifactsQueryKeys.all, 'shared', token] as const,
} as const;

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
    queryFn: () => {
      if (!id) {
        throw new Error('id is required');
      }
      return artifactsApi.getById(id);
    },
    enabled: !!id,
    staleTime: STALE_TIME.SHORT,
  });
}

export function useGenerateArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GenerateArtifactInput) => artifactsApi.generate(input),
    onSuccess: (newArtifact: Artifact) => {
      queryClient.setQueryData<Artifact[]>(
        artifactsQueryKeys.byNote(newArtifact.sourceNoteId),
        (old) => (old ? [newArtifact, ...old] : [newArtifact])
      );
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
    queryFn: () => {
      if (!artifactId) {
        throw new Error('artifactId is required');
      }
      return artifactsApi.getProgress(artifactId);
    },
    enabled: !!artifactId,
  });
}

export function useReviewCard(artifactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReviewCardInput) =>
      artifactsApi.reviewCard(artifactId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: artifactsQueryKeys.progress(artifactId),
      });
      queryClient.invalidateQueries({
        queryKey: artifactsQueryKeys.dueCards(),
      });
    },
  });
}

export function useSubmitQuiz(artifactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubmitQuizInput) =>
      artifactsApi.submitQuiz(artifactId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: artifactsQueryKeys.quizAttempts(artifactId),
      });
    },
  });
}

export function useQuizAttempts(artifactId: string | undefined) {
  return useQuery({
    queryKey: artifactsQueryKeys.quizAttempts(artifactId ?? ''),
    queryFn: () => {
      if (!artifactId) {
        throw new Error('artifactId is required');
      }
      return artifactsApi.getQuizAttempts(artifactId);
    },
    enabled: !!artifactId,
  });
}

export function useDueCards() {
  return useQuery({
    queryKey: artifactsQueryKeys.dueCards(),
    queryFn: () => artifactsApi.getDueCards(),
    staleTime: STALE_TIME.LONG,
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

export function useLearnTopic() {
  return useMutation({
    mutationFn: (topic: string) => artifactsApi.learnTopic({ topic }),
  });
}
