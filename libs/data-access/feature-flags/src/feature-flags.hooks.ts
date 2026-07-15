import { useQuery } from '@tanstack/react-query';

import { httpClient } from '@knowtis/api-client';
import type { FeatureFlagDto } from '@knowtis/shared-types';

export const featureFlagsQueryKeys = {
  all: ['feature-flags'] as const,
} as const;

export function useFeatureFlags() {
  return useQuery({
    queryKey: featureFlagsQueryKeys.all,
    queryFn: () => httpClient.get<FeatureFlagDto[]>('/flags'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useFeatureFlag(key: string): boolean {
  const { data } = useFeatureFlags();
  return data?.find((f) => f.key === key)?.enabled ?? false;
}
