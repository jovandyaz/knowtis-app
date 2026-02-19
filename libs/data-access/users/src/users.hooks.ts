import { useMutation, useQueryClient } from '@tanstack/react-query';

import { usersApi } from '@knowtis/api-client';

import type { UpdateProfileInput } from './users.types';

export const usersQueryKeys = {
  all: ['users'] as const,
  profile: () => [...usersQueryKeys.all, 'profile'] as const,
} as const;

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => usersApi.updateProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'profile'] });
    },
  });
}
