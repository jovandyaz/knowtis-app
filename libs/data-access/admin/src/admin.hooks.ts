import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { aiModelsApi, httpClient } from '@knowtis/api-client';
import { featureFlagsQueryKeys } from '@knowtis/data-access-feature-flags';
import type {
  AIProvider,
  ModelTier,
  UpdateCatalogCopyInput,
} from '@knowtis/shared-types';

import {
  AdminUserSchema,
  AiConfigSchema,
  AiHealthSchema,
  CatalogModelSchema,
  CatalogOverviewSchema,
  CatalogSyncResultSchema,
  DailyUsageSchema,
  FeatureFlagSchema,
  MetricsSummarySchema,
  MetricsTimeseriesSchema,
  PaginatedAuditSchema,
  PaginatedUsersSchema,
  ProviderTestResultSchema,
  SelectableModelsSchema,
  SystemProvidersSchema,
  type AdminUser,
  type AdminUsersParams,
  type AuditParams,
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
  aiTimeseries: (period: MetricsPeriod) =>
    [...adminQueryKeys.all, 'ai-timeseries', period] as const,
  auditLists: () => [...adminQueryKeys.all, 'audit'] as const,
  auditList: (params: AuditParams) =>
    [...adminQueryKeys.auditLists(), params] as const,
  aiConfig: () => [...adminQueryKeys.all, 'ai-config'] as const,
  selectableModels: () => [...adminQueryKeys.all, 'selectable-models'] as const,
  systemProviders: () => [...adminQueryKeys.all, 'system-providers'] as const,
  aiHealth: () => [...adminQueryKeys.all, 'ai-health'] as const,
  aiCatalog: () => [...adminQueryKeys.all, 'ai-catalog'] as const,
} as const;

function usersPath({ page, limit, search, role }: AdminUsersParams): string {
  const params = [`page=${page}`, `limit=${limit}`];
  if (search) {
    params.push(`search=${encodeURIComponent(search)}`);
  }
  if (role) {
    params.push(`role=${role}`);
  }
  return `/admin/users?${params.join('&')}`;
}

export function useAdminUsers(params: AdminUsersParams) {
  return useQuery({
    queryKey: adminQueryKeys.users(params),
    queryFn: async () =>
      PaginatedUsersSchema.parse(await httpClient.get(usersPath(params))),
    staleTime: 1000 * 60,
    placeholderData: keepPreviousData,
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
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.auditLists(),
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

export function useGlobalAiTimeseries(period: MetricsPeriod) {
  return useQuery({
    queryKey: adminQueryKeys.aiTimeseries(period),
    queryFn: async () =>
      MetricsTimeseriesSchema.parse(
        await httpClient.get(`/admin/ai/metrics/timeseries?period=${period}`)
      ),
    staleTime: 1000 * 60,
  });
}

function invalidateFlagDependents(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: featureFlagsQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: adminQueryKeys.auditLists() });
  queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiConfig() });
  queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiHealth() });
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
        await httpClient.put(`/flags/${encodeURIComponent(input.key)}`, {
          enabled: input.enabled,
          ...(input.description !== undefined && {
            description: input.description,
          }),
        })
      ),
    onSuccess: () => {
      invalidateFlagDependents(queryClient);
    },
  });
}

export function useDeleteFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      httpClient.delete(`/flags/${encodeURIComponent(key)}`),
    onSuccess: () => {
      invalidateFlagDependents(queryClient);
    },
  });
}

export function useAiConfig() {
  return useQuery({
    queryKey: adminQueryKeys.aiConfig(),
    queryFn: async () =>
      AiConfigSchema.parse(await httpClient.get('/ai/config')),
    staleTime: 1000 * 60,
  });
}

export function useSetAiConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; value: string }) =>
      httpClient.put(`/ai/config/${encodeURIComponent(input.key)}`, {
        value: input.value,
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiConfig() });
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.auditLists(),
      });
    },
  });
}

export function useResetAiConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string }) =>
      httpClient.delete(`/ai/config/${encodeURIComponent(input.key)}`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiConfig() });
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.auditLists(),
      });
    },
  });
}

export function useSelectableModels() {
  return useQuery({
    queryKey: adminQueryKeys.selectableModels(),
    queryFn: async () =>
      SelectableModelsSchema.parse(await aiModelsApi.getModels()),
    staleTime: 1000 * 60 * 5,
  });
}

export function useSystemProviders() {
  return useQuery({
    queryKey: adminQueryKeys.systemProviders(),
    queryFn: async () =>
      SystemProvidersSchema.parse(await httpClient.get('/ai/providers')),
    staleTime: 1000 * 60,
  });
}

/** The response is the applied state for every provider, so it seeds the list cache directly. */
function useSystemProviderMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) =>
      SystemProvidersSchema.parse(await mutationFn(input)),
    onSuccess: (providers) =>
      queryClient.setQueryData(adminQueryKeys.systemProviders(), providers),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.systemProviders(),
      });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.auditLists() });
    },
  });
}

export function useSetSystemProvider() {
  return useSystemProviderMutation(
    (input: { provider: AIProvider; apiKey?: string; enabled?: boolean }) =>
      httpClient.put(`/ai/providers/${input.provider}`, {
        ...(input.apiKey !== undefined && { apiKey: input.apiKey }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
      })
  );
}

export function useClearSystemProviderKey() {
  return useSystemProviderMutation((provider: AIProvider) =>
    httpClient.delete(`/ai/providers/${provider}/key`)
  );
}

export function useTestSystemProvider() {
  return useMutation({
    mutationFn: async (provider: AIProvider) =>
      ProviderTestResultSchema.parse(
        await httpClient.post(`/ai/providers/${provider}/test`, {})
      ),
  });
}

const AI_HEALTH_REFETCH_MS = 60_000;

export function useAiHealth() {
  return useQuery({
    queryKey: adminQueryKeys.aiHealth(),
    queryFn: async () =>
      AiHealthSchema.parse(await httpClient.get('/ai/health')),
    staleTime: 1000 * 30,
    refetchInterval: AI_HEALTH_REFETCH_MS,
  });
}

export function useAiCatalog() {
  return useQuery({
    queryKey: adminQueryKeys.aiCatalog(),
    queryFn: async () =>
      CatalogOverviewSchema.parse(await httpClient.get('/ai/catalog')),
    staleTime: 1000 * 60,
  });
}

function catalogModelPath(id: string): string {
  return `/ai/catalog/${encodeURIComponent(id)}`;
}

/** Promoting or retiring changes what the user picker offers, so the model list goes stale with the catalog. Returned so the mutation stays pending until the refetches land — a caller disabling buttons on `isPending` would otherwise re-enable them over stale rows. */
function invalidateCatalogDependents(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiCatalog() }),
    queryClient.invalidateQueries({
      queryKey: adminQueryKeys.selectableModels(),
    }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.auditLists() }),
  ]);
}

function useCatalogModelMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) =>
      CatalogModelSchema.parse(await mutationFn(input)),
    onSettled: () => invalidateCatalogDependents(queryClient),
  });
}

export function usePromoteCatalogModel() {
  return useCatalogModelMutation((input: { id: string; tier: ModelTier }) =>
    httpClient.post(`${catalogModelPath(input.id)}/promote`, {
      tier: input.tier,
    })
  );
}

export function useRetireCatalogModel() {
  return useCatalogModelMutation((id: string) =>
    httpClient.post(`${catalogModelPath(id)}/retire`)
  );
}

export function useUpdateCatalogCopy() {
  return useCatalogModelMutation(
    (input: { id: string; patch: UpdateCatalogCopyInput }) =>
      httpClient.patch(catalogModelPath(input.id), {
        ...(input.patch.label !== undefined && { label: input.patch.label }),
        ...(input.patch.description !== undefined && {
          description: input.patch.description,
        }),
      })
  );
}

export function useResolveCatalogAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: number) =>
      httpClient.post(`/ai/catalog/alerts/${alertId}/resolve`),
    onSettled: () => invalidateCatalogDependents(queryClient),
  });
}

export function useSyncCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      CatalogSyncResultSchema.parse(await httpClient.post('/ai/catalog/sync')),
    onSettled: () => invalidateCatalogDependents(queryClient),
  });
}

export function useAuditLog(params: AuditParams) {
  return useQuery({
    queryKey: adminQueryKeys.auditList(params),
    queryFn: async () =>
      PaginatedAuditSchema.parse(
        await httpClient.get(
          `/admin/audit?page=${params.page}&limit=${params.limit}`
        )
      ),
    staleTime: 1000 * 60,
    placeholderData: keepPreviousData,
  });
}
