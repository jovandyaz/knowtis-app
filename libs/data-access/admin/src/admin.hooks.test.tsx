import type { ReactNode } from 'react';
import { useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { aiModelsApi, httpClient } from '@knowtis/api-client';

import {
  adminQueryKeys,
  useAdminUsers,
  useAiCatalog,
  useAiCatalogCandidates,
  useAiConfig,
  useAiHealth,
  useAuditLog,
  useClearSystemProviderKey,
  useDeleteFeatureFlag,
  useGlobalAiTimeseries,
  usePromoteCatalogModel,
  useResetAiConfig,
  useResolveCatalogAlert,
  useRetireCatalogModel,
  useSelectableModels,
  useSetAiConfig,
  useSetSystemProvider,
  useSyncCatalog,
  useSystemProviders,
  useTestSystemProvider,
  useUpdateCatalogCopy,
  useUpdateUserRole,
  useUpsertFeatureFlag,
} from './admin.hooks';
import { AiConfigEntrySchema } from './admin.types';

vi.mock('@knowtis/api-client', () => ({
  httpClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  aiModelsApi: { getModels: vi.fn() },
}));

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PAGE = {
  items: [
    {
      id: '3b241101-e2bb-4255-8caf-4136c566a962',
      email: 'ada@knowtis.app',
      name: 'Ada',
      avatarUrl: null,
      role: 'admin',
      provider: 'local',
      isAnonymous: false,
      createdAt: '2026-07-01T00:00:00.000Z',
      emailVerifiedAt: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 25,
};

describe('useAdminUsers', () => {
  it('fetches and validates a page of users', async () => {
    vi.mocked(httpClient.get).mockResolvedValue(PAGE);

    const { result } = renderHook(() => useAdminUsers({ page: 1, limit: 25 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.get).toHaveBeenCalledWith('/admin/users?page=1&limit=25');
    expect(result.current.data?.items[0].email).toBe('ada@knowtis.app');
    expect(result.current.data?.items[0].createdAt).toBeInstanceOf(Date);
  });

  it('encodes the search param', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...PAGE,
      items: [],
      total: 0,
    });

    renderHook(() => useAdminUsers({ page: 1, limit: 25, search: 'a b' }), {
      wrapper: Wrapper,
    });

    await waitFor(() =>
      expect(httpClient.get).toHaveBeenCalledWith(
        '/admin/users?page=1&limit=25&search=a%20b'
      )
    );
  });

  it('appends the role filter to the query string', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...PAGE,
      items: [],
      total: 0,
    });

    renderHook(() => useAdminUsers({ page: 1, limit: 25, role: 'admin' }), {
      wrapper: Wrapper,
    });

    await waitFor(() =>
      expect(httpClient.get).toHaveBeenCalledWith(
        '/admin/users?page=1&limit=25&role=admin'
      )
    );
  });
});

const AUDIT_PAGE = {
  items: [
    {
      id: '3b241101-e2bb-4255-8caf-4136c566a962',
      actorId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      actorEmail: 'ada@knowtis.app',
      action: 'user.role.updated',
      targetType: 'user',
      targetId: '3b241101-e2bb-4255-8caf-4136c566a962',
      before: { role: 'user' },
      after: { role: 'admin' },
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 2,
  limit: 50,
};

describe('useAuditLog', () => {
  it('fetches and validates a page of audit entries', async () => {
    vi.mocked(httpClient.get).mockResolvedValue(AUDIT_PAGE);

    const { result } = renderHook(() => useAuditLog({ page: 2, limit: 50 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.get).toHaveBeenCalledWith('/admin/audit?page=2&limit=50');
    expect(result.current.data?.items[0].action).toBe('user.role.updated');
    expect(result.current.data?.items[0].createdAt).toBeInstanceOf(Date);
  });

  it('rejects a payload that does not match the audit shape', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...AUDIT_PAGE,
      items: [{ ...AUDIT_PAGE.items[0], id: 'not-a-uuid' }],
    });

    const { result } = renderHook(() => useAuditLog({ page: 2, limit: 50 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('accepts an actorEmail that is not a valid email format', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...AUDIT_PAGE,
      items: [{ ...AUDIT_PAGE.items[0], actorEmail: 'not-an-email' }],
    });

    const { result } = renderHook(() => useAuditLog({ page: 2, limit: 50 }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.items[0].actorEmail).toBe('not-an-email');
  });
});

describe('useUpdateUserRole', () => {
  it('patches the role endpoint', async () => {
    vi.mocked(httpClient.patch).mockResolvedValue(PAGE.items[0]);

    const { result } = renderHook(() => useUpdateUserRole(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ userId: PAGE.items[0].id, role: 'user' });

    await waitFor(() =>
      expect(httpClient.patch).toHaveBeenCalledWith(
        `/admin/users/${PAGE.items[0].id}/role`,
        { role: 'user' }
      )
    );
  });
});

describe('useUpsertFeatureFlag', () => {
  it('puts the flag endpoint and resolves with the parsed flag', async () => {
    vi.mocked(httpClient.put).mockResolvedValue({
      key: 'ai_enabled',
      enabled: true,
      description: 'Enables AI-powered text completion',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useUpsertFeatureFlag(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ key: 'ai_enabled', enabled: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.put).toHaveBeenCalledWith('/flags/ai_enabled', {
      enabled: true,
    });
    expect(result.current.data?.updatedAt).toBeInstanceOf(Date);
  });

  it('invalidates the ai config and health queries the flag gates', async () => {
    vi.mocked(httpClient.put).mockResolvedValue({
      key: 'ai_enabled',
      enabled: true,
      description: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpsertFeatureFlag(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate({ key: 'ai_enabled', enabled: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: adminQueryKeys.aiConfig(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: adminQueryKeys.aiHealth(),
    });
  });
});

describe('useDeleteFeatureFlag', () => {
  it('calls the delete endpoint for the flag key', async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({});

    const { result } = renderHook(() => useDeleteFeatureFlag(), {
      wrapper: Wrapper,
    });
    result.current.mutate('ai_enabled');

    await waitFor(() =>
      expect(httpClient.delete).toHaveBeenCalledWith('/flags/ai_enabled')
    );
  });

  it('invalidates the ai config and health queries the flag gates', async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({});
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteFeatureFlag(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate('ai_enabled');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: adminQueryKeys.aiConfig(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: adminQueryKeys.aiHealth(),
    });
  });
});

describe('useAiConfig', () => {
  it('fetches and validates the effective config entries', async () => {
    vi.mocked(httpClient.get).mockResolvedValue([
      {
        key: 'ai_default_model',
        value: 'anthropic:claude-sonnet-5',
        kind: 'model',
        source: 'custom',
        description: null,
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
      {
        key: 'ai_fast_model',
        value: 'anthropic:claude-haiku-4-5-20251001',
        kind: 'model',
        source: 'default',
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_reasoning_effort',
        value: 'medium',
        kind: 'choice',
        source: 'custom',
        description: null,
        updatedAt: null,
      },
    ]);

    const { result } = renderHook(() => useAiConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.get).toHaveBeenCalledWith('/ai/config');
    expect(result.current.data?.[0].updatedAt).toBeInstanceOf(Date);
    expect(result.current.data?.[1].updatedAt).toBeNull();
    expect(result.current.data?.[2].kind).toBe('choice');
  });

  it('keeps the page usable when the API emits a source this bundle predates', async () => {
    vi.mocked(httpClient.get).mockResolvedValue([
      {
        key: 'ai_default_model',
        value: 'x',
        kind: 'model',
        source: 'file',
        description: null,
        updatedAt: null,
      },
    ]);

    const { result } = renderHook(() => useAiConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].source).toBe('default');
  });
});

describe('useSetAiConfig', () => {
  it('puts the config endpoint with the encoded key', async () => {
    vi.mocked(httpClient.put).mockResolvedValue({ success: true });

    const { result } = renderHook(() => useSetAiConfig(), {
      wrapper: Wrapper,
    });
    result.current.mutate({
      key: 'ai_default_model',
      value: 'anthropic:claude-sonnet-5',
    });

    await waitFor(() =>
      expect(httpClient.put).toHaveBeenCalledWith(
        '/ai/config/ai_default_model',
        { value: 'anthropic:claude-sonnet-5' }
      )
    );
  });
});

describe('AiConfigEntrySchema source skew mapping', () => {
  const base = {
    key: 'ai_default_model',
    value: 'anthropic:claude-sonnet-5',
    kind: 'model',
    description: null,
    updatedAt: null,
  };

  it('falls back to default for a source this bundle does not know', () => {
    expect(
      AiConfigEntrySchema.parse({ ...base, source: 'locked' }).source
    ).toBe('default');
  });

  it('parses a stale row together with its stored value', () => {
    expect(
      AiConfigEntrySchema.parse({
        ...base,
        source: 'stale',
        storedValue: 'openrouter:vendor/dead-model',
      })
    ).toMatchObject({
      source: 'stale',
      storedValue: 'openrouter:vendor/dead-model',
    });
  });

  it('defaults storedValue to null for an API that predates it', () => {
    expect(
      AiConfigEntrySchema.parse({ ...base, source: 'custom' }).storedValue
    ).toBeNull();
  });

  it('passes the new custom value through unchanged', () => {
    expect(
      AiConfigEntrySchema.parse({ ...base, source: 'custom' }).source
    ).toBe('custom');
  });

  it('defaults a missing kind to model', () => {
    expect(
      AiConfigEntrySchema.parse({ ...base, kind: undefined, source: 'custom' })
        .kind
    ).toBe('model');
  });

  it('keeps a kind this bundle does not know instead of rejecting the entry', () => {
    expect(
      AiConfigEntrySchema.parse({
        ...base,
        kind: 'future-kind',
        source: 'custom',
      }).kind
    ).toBe('future-kind');
  });
});

describe('useAiConfig kind skew tolerance', () => {
  it('keeps the known entries when a newer API emits an unknown kind', async () => {
    vi.mocked(httpClient.get).mockResolvedValue([
      {
        key: 'ai_default_model',
        value: 'anthropic:claude-sonnet-5',
        kind: 'model',
        source: 'custom',
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_future_setting',
        value: 'on',
        kind: 'future-kind',
        source: 'custom',
        description: null,
        updatedAt: null,
      },
    ]);

    const { result } = renderHook(() => useAiConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].kind).toBe('model');
    expect(result.current.data?.[1].kind).toBe('future-kind');
  });
});

describe('useResetAiConfig', () => {
  it('deletes the config key and invalidates the config query', async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({});
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useResetAiConfig(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate({ key: 'ai_default_model' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.delete).toHaveBeenCalledWith(
      '/ai/config/ai_default_model'
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: adminQueryKeys.aiConfig(),
    });
  });
});

describe('useSelectableModels', () => {
  it('fetches the curated model list', async () => {
    vi.mocked(aiModelsApi.getModels).mockResolvedValue([
      {
        id: 'anthropic:claude-sonnet-5',
        label: 'Sonnet 5',
        descriptionKey: 'aiModels.sonnet5',
        tier: 'balanced',
        costClass: 2,
        contextWindow: 1000000,
        isDefault: true,
        billedToUser: false,
      },
    ]);

    const { result } = renderHook(() => useSelectableModels(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(aiModelsApi.getModels).toHaveBeenCalledTimes(1);
    expect(result.current.data?.[0].id).toBe('anthropic:claude-sonnet-5');
  });
});

describe('useGlobalAiTimeseries', () => {
  it('fetches, validates and coerces bucket dates', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      buckets: [
        {
          bucketStart: '2026-07-15T10:00:00.000Z',
          requests: 3,
          inputTokens: 120,
          outputTokens: 60,
          costUsd: 0.004,
        },
      ],
    });

    const { result } = renderHook(() => useGlobalAiTimeseries('day'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.get).toHaveBeenCalledWith(
      '/admin/ai/metrics/timeseries?period=day'
    );
    expect(result.current.data?.buckets[0].bucketStart).toBeInstanceOf(Date);
    expect(result.current.data?.buckets[0].costUsd).toBe(0.004);
  });
});

const PROVIDERS = [
  {
    provider: 'anthropic',
    enabled: true,
    keySource: 'database',
    storedKeyUnreadable: false,
    keyPrefix: 'sk-ant-1',
    updatedAt: '2026-07-17T00:00:00.000Z',
  },
];

describe('useSystemProviders', () => {
  it('fetches and validates the provider list', async () => {
    vi.mocked(httpClient.get).mockResolvedValue(PROVIDERS);

    const { result } = renderHook(() => useSystemProviders(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.get).toHaveBeenCalledWith('/ai/providers');
    expect(result.current.data?.[0].updatedAt).toBeInstanceOf(Date);
    expect(result.current.data?.[0].storedKeyUnreadable).toBe(false);
  });
});

describe('useSetSystemProvider', () => {
  it('sends only the fields the caller set', async () => {
    vi.mocked(httpClient.put).mockResolvedValue(PROVIDERS);

    const { result } = renderHook(() => useSetSystemProvider(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ provider: 'anthropic', enabled: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.put).toHaveBeenCalledWith('/ai/providers/anthropic', {
      enabled: false,
    });
  });

  it('seeds the list cache with the applied state the mutation returned', async () => {
    vi.mocked(httpClient.put).mockResolvedValue(PROVIDERS);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useSetSystemProvider(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate({ provider: 'anthropic', apiKey: 'sk-ant-new' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.put).toHaveBeenCalledWith('/ai/providers/anthropic', {
      apiKey: 'sk-ant-new',
    });
    const cached = client.getQueryData(adminQueryKeys.systemProviders());
    expect(cached).toEqual(result.current.data);
  });
});

describe('useClearSystemProviderKey', () => {
  it('deletes only the key, leaving the provider row', async () => {
    vi.mocked(httpClient.delete).mockResolvedValue(PROVIDERS);

    const { result } = renderHook(() => useClearSystemProviderKey(), {
      wrapper: Wrapper,
    });
    result.current.mutate('openrouter');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.delete).toHaveBeenCalledWith(
      '/ai/providers/openrouter/key'
    );
  });
});

describe('useTestSystemProvider', () => {
  it('reports the model that answered the probe', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      ok: true,
      model: 'anthropic:haiku',
    });

    const { result } = renderHook(() => useTestSystemProvider(), {
      wrapper: Wrapper,
    });
    result.current.mutate('anthropic');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.post).toHaveBeenCalledWith(
      '/ai/providers/anthropic/test',
      {}
    );
    expect(result.current.data).toEqual({
      ok: true,
      model: 'anthropic:haiku',
    });
  });

  it('resolves a refused probe rather than surfacing it as an error', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      ok: false,
      reason: 'rejected',
      message: 'anthropic refused the probe: bad key',
    });

    const { result } = renderHook(() => useTestSystemProvider(), {
      wrapper: Wrapper,
    });
    result.current.mutate('anthropic');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toMatchObject({
      ok: false,
      reason: 'rejected',
    });
  });

  it('rejects a probe result that is neither a success nor a failure', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useTestSystemProvider(), {
      wrapper: Wrapper,
    });
    result.current.mutate('anthropic');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

const CATALOG_MODEL = {
  id: 'openrouter:z-ai/glm-5.2',
  label: 'GLM 5.2',
  description: 'Open-weight generalist',
  status: 'candidate',
  tier: 'open',
  inputCostPerToken: 0.0000004,
  outputCostPerToken: 0.0000016,
  maxInputTokens: 200000,
  maxOutputTokens: 8192,
  intelligenceIndex: 42,
  upstreamCreatedAt: '2026-06-01T00:00:00.000Z',
  upstreamExpirationDate: null,
  lastSeenAt: '2026-08-10T00:00:00.000Z',
  promotedAt: null,
};

const CATALOG_ALERT = {
  id: 7,
  modelId: 'openrouter:z-ai/glm-5.2',
  kind: 'deprecation',
  detail: 'Upstream flagged the model as deprecated',
  createdAt: '2026-08-09T00:00:00.000Z',
  resolvedAt: null,
};

const CATALOG_OVERVIEW = {
  candidates: [CATALOG_MODEL],
  promoted: [],
  alerts: [CATALOG_ALERT],
};

const ENCODED_MODEL_PATH = '/ai/catalog/openrouter%3Az-ai%2Fglm-5.2';

function renderWithInvalidateSpy<THook>(hook: () => THook) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { result, invalidateSpy };
}

function expectCatalogDependentsInvalidated(
  invalidateSpy: MockInstance<QueryClient['invalidateQueries']>
) {
  expect(invalidateSpy).toHaveBeenCalledWith({
    queryKey: adminQueryKeys.aiCatalog(),
  });
  expect(invalidateSpy).toHaveBeenCalledWith({
    queryKey: adminQueryKeys.selectableModels(),
  });
  expect(invalidateSpy).toHaveBeenCalledWith({
    queryKey: adminQueryKeys.auditLists(),
  });
}

describe('useAiCatalog', () => {
  it('fetches the overview and coerces the wire timestamps', async () => {
    vi.mocked(httpClient.get).mockResolvedValue(CATALOG_OVERVIEW);

    const { result } = renderHook(() => useAiCatalog(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.get).toHaveBeenCalledWith('/ai/catalog');
    expect(result.current.data?.candidates[0].id).toBe(
      'openrouter:z-ai/glm-5.2'
    );
    expect(result.current.data?.candidates[0].lastSeenAt).toBeInstanceOf(Date);
    expect(result.current.data?.candidates[0].upstreamCreatedAt).toBeInstanceOf(
      Date
    );
    expect(result.current.data?.candidates[0].promotedAt).toBeNull();
    expect(result.current.data?.alerts[0].createdAt).toBeInstanceOf(Date);
    expect(result.current.data?.alerts[0].id).toBe(7);
  });

  it('renders a model from an API that omits the optional fields', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      candidates: [
        {
          id: CATALOG_MODEL.id,
          label: CATALOG_MODEL.label,
          status: 'candidate',
          tier: 'open',
          inputCostPerToken: 0,
          outputCostPerToken: 0,
          maxInputTokens: 200000,
          lastSeenAt: CATALOG_MODEL.lastSeenAt,
        },
      ],
      promoted: [],
      alerts: [{ ...CATALOG_ALERT, resolvedAt: undefined }],
    });

    const { result } = renderHook(() => useAiCatalog(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.candidates[0].description).toBe('');
    expect(result.current.data?.candidates[0].maxOutputTokens).toBeNull();
    expect(result.current.data?.candidates[0].intelligenceIndex).toBeNull();
    expect(result.current.data?.candidates[0].upstreamCreatedAt).toBeNull();
    expect(result.current.data?.candidates[0].promotedAt).toBeNull();
    expect(result.current.data?.alerts[0].resolvedAt).toBeNull();
  });

  it('keeps the catalog usable when the API omits the candidate queue', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      promoted: [CATALOG_MODEL],
      alerts: [CATALOG_ALERT],
    });

    const { result } = renderHook(() => useAiCatalog(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.candidates).toEqual([]);
    expect(result.current.data?.promoted[0].id).toBe(CATALOG_MODEL.id);
    expect(result.current.data?.alerts[0].id).toBe(CATALOG_ALERT.id);
  });

  it('rejects a model whose status this bundle does not know', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...CATALOG_OVERVIEW,
      candidates: [{ ...CATALOG_MODEL, status: 'shadow-banned' }],
    });

    const { result } = renderHook(() => useAiCatalog(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('surfaces an alert kind this bundle does not know instead of failing', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...CATALOG_OVERVIEW,
      alerts: [{ ...CATALOG_ALERT, kind: 'upstream_vanished' }],
    });

    const { result } = renderHook(() => useAiCatalog(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.alerts[0].kind).toBe('upstream_vanished');
  });
});

describe('useAiCatalogCandidates', () => {
  const CANDIDATE = {
    id: 'openrouter:vendor/one',
    label: 'One',
    description: '',
    status: 'candidate',
    tier: 'open',
    inputCostPerToken: 0.000001,
    outputCostPerToken: 0.000002,
    maxInputTokens: 128000,
    maxOutputTokens: null,
    intelligenceIndex: 42,
    upstreamCreatedAt: null,
    upstreamExpirationDate: null,
    lastSeenAt: '2026-08-11T00:00:00.000Z',
    promotedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests the page and encodes the search term', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      items: [CANDIDATE],
      total: 97,
      page: 2,
      limit: 25,
    });

    const { result } = renderHook(
      () => useAiCatalogCandidates({ page: 2, limit: 25, search: 'a b' }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.get).toHaveBeenCalledWith(
      '/ai/catalog/candidates?page=2&limit=25&search=a%20b'
    );
    expect(result.current.data?.total).toBe(97);
    expect(result.current.data?.items[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it('omits the search param when there is no term', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
    });

    renderHook(() => useAiCatalogCandidates({ page: 1, limit: 25 }), {
      wrapper: Wrapper,
    });

    await waitFor(() =>
      expect(httpClient.get).toHaveBeenCalledWith(
        '/ai/catalog/candidates?page=1&limit=25'
      )
    );
  });

  it('keeps the previous page on screen while the next one loads', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      items: [CANDIDATE],
      total: 97,
      page: 1,
      limit: 25,
    });

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useAiCatalogCandidates({ page, limit: 25 }),
      { wrapper: Wrapper, initialProps: { page: 1 } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    let releaseSecondPage: (page: unknown) => void = () => undefined;
    vi.mocked(httpClient.get).mockReturnValueOnce(
      new Promise((resolve) => {
        releaseSecondPage = resolve;
      })
    );
    rerender({ page: 2 });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data?.items[0].id).toBe(CANDIDATE.id);

    releaseSecondPage({ items: [], total: 97, page: 2, limit: 25 });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.items).toEqual([]);
  });

  it('rejects a page whose total contradicts the paginated envelope', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      items: [CANDIDATE],
      total: -1,
      page: 1,
      limit: 25,
    });

    const { result } = renderHook(
      () => useAiCatalogCandidates({ page: 1, limit: 25 }),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('usePromoteCatalogModel', () => {
  it('encodes the slash in the model id instead of splitting the path', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      ...CATALOG_MODEL,
      status: 'promoted',
      promotedAt: '2026-08-10T12:00:00.000Z',
    });

    const { result } = renderHook(() => usePromoteCatalogModel(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ id: CATALOG_MODEL.id, tier: 'open' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.post).toHaveBeenCalledWith(
      `${ENCODED_MODEL_PATH}/promote`,
      { tier: 'open' }
    );
    expect(result.current.data?.promotedAt).toBeInstanceOf(Date);
  });

  it('invalidates the catalog, the selectable models and the audit log', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      ...CATALOG_MODEL,
      status: 'promoted',
    });

    const { result, invalidateSpy } = renderWithInvalidateSpy(() =>
      usePromoteCatalogModel()
    );
    result.current.mutate({ id: CATALOG_MODEL.id, tier: 'open' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectCatalogDependentsInvalidated(invalidateSpy);
  });

  it('stays pending until the invalidated queries have refetched', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      ...CATALOG_MODEL,
      status: 'promoted',
    });
    let refetched!: () => void;
    const refetching = new Promise<void>((resolve) => {
      refetched = resolve;
    });

    const { result, invalidateSpy } = renderWithInvalidateSpy(() =>
      usePromoteCatalogModel()
    );
    invalidateSpy.mockReturnValue(refetching);
    result.current.mutate({ id: CATALOG_MODEL.id, tier: 'open' });

    await waitFor(() => expectCatalogDependentsInvalidated(invalidateSpy));
    expect(result.current.isPending).toBe(true);

    refetched();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useRetireCatalogModel', () => {
  it('encodes the slash in the model id instead of splitting the path', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      ...CATALOG_MODEL,
      status: 'retired',
    });

    const { result } = renderHook(() => useRetireCatalogModel(), {
      wrapper: Wrapper,
    });
    result.current.mutate(CATALOG_MODEL.id);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.post).toHaveBeenCalledWith(
      `${ENCODED_MODEL_PATH}/retire`
    );
    expect(result.current.data?.status).toBe('retired');
  });

  it('invalidates the catalog, the selectable models and the audit log', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      ...CATALOG_MODEL,
      status: 'retired',
    });

    const { result, invalidateSpy } = renderWithInvalidateSpy(() =>
      useRetireCatalogModel()
    );
    result.current.mutate(CATALOG_MODEL.id);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectCatalogDependentsInvalidated(invalidateSpy);
  });
});

describe('useUpdateCatalogCopy', () => {
  it('encodes the slash in the model id and sends only the fields the caller set', async () => {
    vi.mocked(httpClient.patch).mockResolvedValue({
      ...CATALOG_MODEL,
      label: 'GLM 5.2 Turbo',
    });

    const { result } = renderHook(() => useUpdateCatalogCopy(), {
      wrapper: Wrapper,
    });
    result.current.mutate({
      id: CATALOG_MODEL.id,
      patch: { label: 'GLM 5.2 Turbo' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.patch).toHaveBeenCalledWith(ENCODED_MODEL_PATH, {
      label: 'GLM 5.2 Turbo',
    });
    expect(result.current.data?.label).toBe('GLM 5.2 Turbo');
  });

  it('invalidates the catalog, the selectable models and the audit log', async () => {
    vi.mocked(httpClient.patch).mockResolvedValue(CATALOG_MODEL);

    const { result, invalidateSpy } = renderWithInvalidateSpy(() =>
      useUpdateCatalogCopy()
    );
    result.current.mutate({
      id: CATALOG_MODEL.id,
      patch: { description: 'Cheap and fast' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.patch).toHaveBeenCalledWith(ENCODED_MODEL_PATH, {
      description: 'Cheap and fast',
    });
    expectCatalogDependentsInvalidated(invalidateSpy);
  });
});

describe('useResolveCatalogAlert', () => {
  it('posts the numeric alert id and invalidates the catalog dependents', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({});

    const { result, invalidateSpy } = renderWithInvalidateSpy(() =>
      useResolveCatalogAlert()
    );
    result.current.mutate(CATALOG_ALERT.id);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.post).toHaveBeenCalledWith(
      '/ai/catalog/alerts/7/resolve'
    );
    expectCatalogDependentsInvalidated(invalidateSpy);
  });
});

describe('catalog mutations and the cached candidates page', () => {
  const CANDIDATES_PARAMS = { page: 1, limit: 25 };

  const CASES: {
    name: string;
    hook: () => { mutate: (input: never) => void; isSuccess: boolean };
    input: unknown;
    respond: () => void;
  }[] = [
    {
      name: 'usePromoteCatalogModel',
      hook: usePromoteCatalogModel,
      input: { id: CATALOG_MODEL.id, tier: 'open' },
      respond: () =>
        vi
          .mocked(httpClient.post)
          .mockResolvedValue({ ...CATALOG_MODEL, status: 'promoted' }),
    },
    {
      name: 'useRetireCatalogModel',
      hook: useRetireCatalogModel,
      input: CATALOG_MODEL.id,
      respond: () =>
        vi
          .mocked(httpClient.post)
          .mockResolvedValue({ ...CATALOG_MODEL, status: 'retired' }),
    },
    {
      name: 'useUpdateCatalogCopy',
      hook: useUpdateCatalogCopy,
      input: { id: CATALOG_MODEL.id, patch: { label: 'GLM 5.2 Turbo' } },
      respond: () =>
        vi.mocked(httpClient.patch).mockResolvedValue(CATALOG_MODEL),
    },
    {
      name: 'useResolveCatalogAlert',
      hook: useResolveCatalogAlert,
      input: CATALOG_ALERT.id,
      respond: () => vi.mocked(httpClient.post).mockResolvedValue({}),
    },
    {
      name: 'useSyncCatalog',
      hook: useSyncCatalog,
      input: undefined,
      respond: () =>
        vi.mocked(httpClient.post).mockResolvedValue({
          status: 'completed',
          skippedReason: null,
          upstream: 12,
          candidates: 3,
          alerts: 0,
          failures: 0,
        }),
    },
  ];

  it.each(CASES)(
    '$name marks the cached candidates page stale',
    async ({ hook, input, respond }) => {
      respond();
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const candidatesKey =
        adminQueryKeys.aiCatalogCandidates(CANDIDATES_PARAMS);
      client.setQueryData(candidatesKey, {
        items: [],
        total: 0,
        page: 1,
        limit: 25,
      });

      const { result } = renderHook(hook, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      });
      result.current.mutate(input as never);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(client.getQueryState(candidatesKey)?.isInvalidated).toBe(true);
    }
  );
});

describe('useAiHealth', () => {
  it('parses the provider health map from /ai/health', async () => {
    vi.mocked(httpClient.get).mockResolvedValueOnce({
      providers: {
        openrouter: {
          configured: true,
          cooling: true,
          failureCount: 3,
          lastFailureAt: '2026-07-29T10:00:00.000Z',
          lastSuccessAt: null,
          cooldownEndsAt: '2026-07-29T10:05:00.000Z',
        },
      },
    });

    const { result } = renderHook(() => useAiHealth(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(httpClient.get).toHaveBeenCalledWith('/ai/health');
    expect(result.current.data?.providers['openrouter']?.cooling).toBe(true);
  });
});

describe('admin mutations and their invalidations', () => {
  const PROVIDERS = [
    {
      provider: 'anthropic',
      enabled: true,
      keySource: 'database',
      storedKeyUnreadable: false,
      keyPrefix: 'sk-ant',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ];
  const FLAG = {
    key: 'ai_enabled',
    enabled: true,
    description: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  const CASES: {
    name: string;
    hook: () => { mutate: (input: never) => void; isPending: boolean };
    input: unknown;
    respond: () => void;
  }[] = [
    {
      name: 'useUpdateUserRole',
      hook: useUpdateUserRole,
      input: { userId: PAGE.items[0].id, role: 'user' },
      respond: () =>
        vi.mocked(httpClient.patch).mockResolvedValue(PAGE.items[0]),
    },
    {
      name: 'useUpsertFeatureFlag',
      hook: useUpsertFeatureFlag,
      input: { key: 'ai_enabled', enabled: true },
      respond: () => vi.mocked(httpClient.put).mockResolvedValue(FLAG),
    },
    {
      name: 'useDeleteFeatureFlag',
      hook: useDeleteFeatureFlag,
      input: 'ai_enabled',
      respond: () => vi.mocked(httpClient.delete).mockResolvedValue({}),
    },
    {
      name: 'useSetAiConfig',
      hook: useSetAiConfig,
      input: { key: 'ai_default_model', value: 'anthropic:claude-sonnet-5' },
      respond: () => vi.mocked(httpClient.put).mockResolvedValue({}),
    },
    {
      name: 'useResetAiConfig',
      hook: useResetAiConfig,
      input: { key: 'ai_default_model' },
      respond: () => vi.mocked(httpClient.delete).mockResolvedValue({}),
    },
    {
      name: 'useSetSystemProvider',
      hook: useSetSystemProvider,
      input: { provider: 'anthropic', enabled: true },
      respond: () => vi.mocked(httpClient.put).mockResolvedValue(PROVIDERS),
    },
    {
      name: 'useClearSystemProviderKey',
      hook: useClearSystemProviderKey,
      input: 'anthropic',
      respond: () => vi.mocked(httpClient.delete).mockResolvedValue(PROVIDERS),
    },
  ];

  // A dropped invalidation promise is invisible to a "was it called" assertion:
  // the call happens either way. Holding the refetch open is what separates the
  // two — a caller disabling buttons on `isPending` re-enables them over stale
  // rows exactly in this window.
  it.each(CASES)(
    '$name stays pending until its invalidations settle',
    async ({ hook, input, respond }) => {
      respond();
      let releaseInvalidation: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        releaseInvalidation = resolve;
      });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const invalidateSpy = vi
        .spyOn(client, 'invalidateQueries')
        .mockReturnValue(held);

      const { result } = renderHook(hook, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      });
      result.current.mutate(input as never);

      // Anchor on the invalidation having started, not on `isPending` alone:
      // straight after `mutate()` the mutation is pending because its own
      // request is in flight, which a dropped promise would also satisfy.
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
      await Promise.resolve();
      expect(result.current.isPending).toBe(true);

      releaseInvalidation();
      await waitFor(() => expect(result.current.isPending).toBe(false));
    }
  );
});
