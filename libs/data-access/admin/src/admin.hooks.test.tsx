import type { ReactNode } from 'react';
import { useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { aiModelsApi, httpClient } from '@knowtis/api-client';

import {
  useAdminUsers,
  useAiConfig,
  useAuditLog,
  useDeleteFeatureFlag,
  useSelectableModels,
  useSetAiConfig,
  useUpdateUserRole,
  useUpsertFeatureFlag,
} from './admin.hooks';

vi.mock('@knowtis/api-client', () => ({
  httpClient: { get: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
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
});

describe('useAiConfig', () => {
  it('fetches and validates the effective config entries', async () => {
    vi.mocked(httpClient.get).mockResolvedValue([
      {
        key: 'ai_default_model',
        value: 'anthropic:claude-sonnet-5',
        source: 'database',
        description: null,
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
      {
        key: 'ai_fast_model',
        value: 'anthropic:claude-haiku-4-5-20251001',
        source: 'environment',
        description: null,
        updatedAt: null,
      },
    ]);

    const { result } = renderHook(() => useAiConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.get).toHaveBeenCalledWith('/ai/config');
    expect(result.current.data?.[0].updatedAt).toBeInstanceOf(Date);
    expect(result.current.data?.[1].updatedAt).toBeNull();
  });

  it('rejects a payload with an unknown source', async () => {
    vi.mocked(httpClient.get).mockResolvedValue([
      {
        key: 'ai_default_model',
        value: 'x',
        source: 'file',
        description: null,
        updatedAt: null,
      },
    ]);

    const { result } = renderHook(() => useAiConfig(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
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
