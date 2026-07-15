import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { httpClient } from '@knowtis/api-client';
import { featureFlagsQueryKeys } from '@knowtis/data-access-feature-flags';

import {
  AdminUserSchema,
  DailyUsageSchema,
  FeatureFlagSchema,
  MetricsSummarySchema,
  PaginatedUsersSchema,
  type AdminUser,
  type AdminUsersParams,
  type MetricsPeriod,
} from './admin.types';

export const adminQueryKeys = {
  all: ['admin'] as const,
  usersList: () => [...adminQueryKeys.all, 'users'] as const,
  users: (params: AdminUsersParams) =>
    [...adminQueryKeys.usersList(), params] as const,
  aiUsage: () => [...adminQueryKeys.all, 'ai-usage'] as const,
  aiMetrics: (period: MetricsPeriod) =>
    [...adminQueryKeys.all, 'ai-metrics', period] as const,
} as const;

function usersPath({ page, limit, search }: AdminUsersParams): string {
  const params = [`page=${page}`, `limit=${limit}`];
  if (search) {
    params.push(`search=${encodeURIComponent(search)}`);
  }
  return `/admin/users?${params.join('&')}`;
}

export function useAdminUsers(params: AdminUsersParams) {
  return useQuery({
    queryKey: adminQueryKeys.users(params),
    queryFn: async () =>
      PaginatedUsersSchema.parse(await httpClient.get(usersPath(params))),
    staleTime: 1000 * 60,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; role: AdminUser['role'] }) =>
      AdminUserSchema.parse(
        await httpClient.patch(`/admin/users/${input.userId}/role`, {
          role: input.role,
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.usersList(),
      });
    },
  });
}

export function useGlobalAiUsage() {
  return useQuery({
    queryKey: adminQueryKeys.aiUsage(),
    queryFn: async () =>
      DailyUsageSchema.parse(await httpClient.get('/admin/ai/usage')),
    staleTime: 1000 * 60,
  });
}

export function useGlobalAiMetrics(period: MetricsPeriod) {
  return useQuery({
    queryKey: adminQueryKeys.aiMetrics(period),
    queryFn: async () =>
      MetricsSummarySchema.parse(
        await httpClient.get(`/admin/ai/metrics?period=${period}`)
      ),
    staleTime: 1000 * 60,
  });
}

export function useUpsertFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      key: string;
      enabled: boolean;
      description?: string;
    }) =>
      FeatureFlagSchema.parse(
        await httpClient.put(`/flags/${input.key}`, {
          enabled: input.enabled,
          ...(input.description !== undefined && {
            description: input.description,
          }),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featureFlagsQueryKeys.all });
    },
  });
}

export function useDeleteFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => httpClient.delete(`/flags/${key}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featureFlagsQueryKeys.all });
    },
  });
}
