// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { oauthApi } from '@knowtis/api-client';

import {
  oauthGrantsQueryKeys,
  oauthQueryKeys,
  useConsentDecision,
  useOauthGrants,
  useOauthInteraction,
  useRevokeGrant,
} from './oauth.hooks';

vi.mock('@knowtis/api-client', () => ({
  oauthApi: {
    getInteraction: vi.fn(),
    confirm: vi.fn(),
    abort: vi.fn(),
    getGrants: vi.fn(),
    revokeGrant: vi.fn(),
  },
}));

describe('oauth hooks', () => {
  let queryClient: QueryClient;
  const assignMock = vi.fn();

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: assignMock, href: 'http://localhost/oauth/consent' },
    });
  });

  describe('oauthQueryKeys', () => {
    it('scopes the detail key by uid', () => {
      expect(oauthQueryKeys.detail('abc')).toEqual([
        'oauth-interaction',
        'abc',
      ]);
    });
  });

  describe('useOauthInteraction', () => {
    it('fetches and validates the interaction details', async () => {
      const details = {
        clientId: 'https://claude.ai',
        clientName: 'Claude',
        redirectHost: 'claude.ai',
        scopes: ['notes:read', 'notes:write'],
        isCimdClient: true,
      };
      vi.mocked(oauthApi.getInteraction).mockResolvedValue(details);

      const { result } = renderHook(() => useOauthInteraction('uid-1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(oauthApi.getInteraction).toHaveBeenCalledWith('uid-1');
      expect(result.current.data).toEqual(details);
    });

    it('does not retry and surfaces the error when the uid is unknown (404)', async () => {
      vi.mocked(oauthApi.getInteraction).mockRejectedValue(
        new Error('Not Found')
      );

      const { result } = renderHook(() => useOauthInteraction('gone'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(oauthApi.getInteraction).toHaveBeenCalledTimes(1);
    });

    it('stays disabled when no uid is provided', () => {
      const { result } = renderHook(() => useOauthInteraction(''), { wrapper });
      expect(result.current.fetchStatus).toBe('idle');
      expect(oauthApi.getInteraction).not.toHaveBeenCalled();
    });
  });

  describe('useConsentDecision', () => {
    it('posts approvedScopes on approve and navigates full-page to returnTo', async () => {
      vi.mocked(oauthApi.confirm).mockResolvedValue({
        returnTo: 'https://mcp.knowtis.app/oauth/auth/xyz',
      });

      const { result } = renderHook(() => useConsentDecision('uid-1'), {
        wrapper,
      });

      result.current.mutate({
        action: 'approve',
        approvedScopes: ['notes:read', 'notes:write'],
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(oauthApi.confirm).toHaveBeenCalledWith('uid-1', [
        'notes:read',
        'notes:write',
      ]);
      expect(result.current.data).toEqual({
        returnTo: 'https://mcp.knowtis.app/oauth/auth/xyz',
      });
      expect(assignMock).toHaveBeenCalledWith(
        'https://mcp.knowtis.app/oauth/auth/xyz'
      );
    });

    it('calls abort on deny and navigates full-page to returnTo', async () => {
      vi.mocked(oauthApi.abort).mockResolvedValue({
        returnTo: 'https://mcp.knowtis.app/oauth/auth/denied',
      });

      const { result } = renderHook(() => useConsentDecision('uid-2'), {
        wrapper,
      });

      result.current.mutate({ action: 'deny' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(oauthApi.abort).toHaveBeenCalledWith('uid-2');
      expect(oauthApi.confirm).not.toHaveBeenCalled();
      expect(assignMock).toHaveBeenCalledWith(
        'https://mcp.knowtis.app/oauth/auth/denied'
      );
    });

    it('surfaces the error and does not navigate when the decision fails', async () => {
      vi.mocked(oauthApi.confirm).mockRejectedValue(new Error('Conflict'));

      const { result } = renderHook(() => useConsentDecision('uid-9'), {
        wrapper,
      });

      result.current.mutate({
        action: 'approve',
        approvedScopes: ['notes:read'],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(Error);
      expect(assignMock).not.toHaveBeenCalled();
    });
  });

  describe('oauthGrantsQueryKeys', () => {
    it('builds a stable list key', () => {
      expect(oauthGrantsQueryKeys.list()).toEqual(['oauth-grants', 'list']);
    });
  });

  describe('useOauthGrants', () => {
    it('fetches and validates the connected grants', async () => {
      const grants = [
        {
          grantId: 'grant-1',
          clientId: 'https://claude.ai',
          clientName: 'claude.ai',
          scopes: ['notes:read', 'notes:write'],
          createdAt: '2026-07-02T12:00:00.000Z',
        },
      ];
      vi.mocked(oauthApi.getGrants).mockResolvedValue({ grants });

      const { result } = renderHook(() => useOauthGrants(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(grants);
    });

    it('does not retry and surfaces the error when the flag is off (404)', async () => {
      vi.mocked(oauthApi.getGrants).mockRejectedValue(new Error('Not Found'));

      const { result } = renderHook(() => useOauthGrants(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(oauthApi.getGrants).toHaveBeenCalledTimes(1);
    });
  });

  describe('useRevokeGrant', () => {
    it('optimistically removes the grant and revokes it', async () => {
      queryClient.setQueryData(oauthGrantsQueryKeys.list(), [
        {
          grantId: 'grant-1',
          clientId: 'c1',
          clientName: null,
          scopes: [],
          createdAt: 'x',
        },
        {
          grantId: 'grant-2',
          clientId: 'c2',
          clientName: null,
          scopes: [],
          createdAt: 'y',
        },
      ]);
      vi.mocked(oauthApi.revokeGrant).mockResolvedValue(undefined);

      const { result } = renderHook(() => useRevokeGrant(), { wrapper });

      result.current.mutate('grant-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(oauthApi.revokeGrant).toHaveBeenCalledWith('grant-1');
      const cached = queryClient.getQueryData<{ grantId: string }[]>(
        oauthGrantsQueryKeys.list()
      );
      expect(cached?.map((g) => g.grantId)).toEqual(['grant-2']);
    });

    it('rolls back the optimistic removal when revoke fails', async () => {
      const initial = [
        {
          grantId: 'grant-1',
          clientId: 'c1',
          clientName: null,
          scopes: [],
          createdAt: 'x',
        },
      ];
      queryClient.setQueryData(oauthGrantsQueryKeys.list(), initial);
      vi.mocked(oauthApi.revokeGrant).mockRejectedValue(new Error('boom'));

      const { result } = renderHook(() => useRevokeGrant(), { wrapper });

      result.current.mutate('grant-1');

      await waitFor(() => expect(result.current.isError).toBe(true));
      const cached = queryClient.getQueryData<{ grantId: string }[]>(
        oauthGrantsQueryKeys.list()
      );
      expect(cached?.map((g) => g.grantId)).toEqual(['grant-1']);
    });
  });
});
