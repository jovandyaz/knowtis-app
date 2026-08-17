import { HocuspocusProvider } from '@hocuspocus/provider';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import type { RefreshOutcome } from '@knowtis/api-client';

import { useHocuspocusCollaboration } from '../useHocuspocusCollaboration';

const mockProviderInstances: Array<{
  options: Record<string, unknown>;
  destroy: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('@hocuspocus/provider', () => ({
  WebSocketStatus: {
    Connecting: 'connecting',
    Connected: 'connected',
    Disconnected: 'disconnected',
  },
  HocuspocusProvider: vi.fn(function (
    this: unknown,
    options: Record<string, unknown>
  ) {
    const instance = { options, destroy: vi.fn() };
    mockProviderInstances.push(instance);
    return instance;
  }),
}));

describe('useHocuspocusCollaboration — auth failure recovery', () => {
  let yDoc: Y.Doc;
  let awareness: Awareness;

  beforeEach(() => {
    mockProviderInstances.length = 0;
    yDoc = new Y.Doc();
    awareness = new Awareness(yDoc);
  });

  it('calls onAuthRefresh exactly once when authentication fails', async () => {
    const onAuthRefresh = vi.fn().mockResolvedValue('refreshed');

    renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://localhost:3333/collaboration',
        onAuthRefresh,
      })
    );

    const provider = mockProviderInstances[0];
    expect(provider).toBeDefined();

    const onAuthenticationFailed = provider.options[
      'onAuthenticationFailed'
    ] as (params: { reason: string }) => void;

    onAuthenticationFailed({ reason: 'jwt expired' });
    onAuthenticationFailed({ reason: 'jwt expired' });

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('destroys the provider after a failed refresh', async () => {
    const onAuthRefresh = vi.fn().mockResolvedValue('rejected');
    const onSessionExpired = vi.fn();

    renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://localhost:3333/collaboration',
        onAuthRefresh,
        onSessionExpired,
      })
    );

    const provider = mockProviderInstances[0];
    const onAuthenticationFailed = provider.options[
      'onAuthenticationFailed'
    ] as (params: { reason: string }) => void;

    onAuthenticationFailed({ reason: 'jwt expired' });

    await waitFor(() => {
      expect(provider.destroy).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });
  });

  it('passes onAuthenticationFailed to the HocuspocusProvider constructor', () => {
    renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://localhost:3333/collaboration',
      })
    );

    const lastCall = vi.mocked(HocuspocusProvider).mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual(
      expect.objectContaining({
        onAuthenticationFailed: expect.any(Function),
      })
    );
  });

  it('destroys the provider and fires onSessionExpired when no onAuthRefresh is configured', async () => {
    const onSessionExpired = vi.fn();

    renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://localhost:3333/collaboration',
        onSessionExpired,
      })
    );

    const provider = mockProviderInstances[0];
    const onAuthenticationFailed = provider.options[
      'onAuthenticationFailed'
    ] as (params: { reason: string }) => void;

    onAuthenticationFailed({ reason: 'jwt expired' });

    await waitFor(() => {
      expect(provider.destroy).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the provider alive when onAuthRefresh throws, so reconnect can retry', async () => {
    const onAuthRefresh = vi.fn().mockRejectedValue(new Error('network down'));
    const onSessionExpired = vi.fn();

    renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://localhost:3333/collaboration',
        onAuthRefresh,
        onSessionExpired,
      })
    );

    const provider = mockProviderInstances[0];
    const onAuthenticationFailed = provider.options[
      'onAuthenticationFailed'
    ] as (params: { reason: string }) => void;

    onAuthenticationFailed({ reason: 'jwt expired' });

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('keeps the provider alive when the refresh is unavailable', async () => {
    const onAuthRefresh = vi.fn().mockResolvedValue('unavailable');
    const onSessionExpired = vi.fn();

    renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://localhost:3333/collaboration',
        onAuthRefresh,
        onSessionExpired,
      })
    );

    const provider = mockProviderInstances[0];
    const onAuthenticationFailed = provider.options[
      'onAuthenticationFailed'
    ] as (params: { reason: string }) => void;

    onAuthenticationFailed({ reason: 'jwt expired' });

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not destroy the provider if a second auth failure fires while refresh is in-flight and refresh succeeds', async () => {
    let resolveRefresh: ((value: RefreshOutcome) => void) | undefined;
    const onAuthRefresh = vi.fn(
      () =>
        new Promise<RefreshOutcome>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    const onSessionExpired = vi.fn();

    renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://localhost:3333/collaboration',
        onAuthRefresh,
        onSessionExpired,
      })
    );

    const provider = mockProviderInstances[0];
    const onAuthenticationFailed = provider.options[
      'onAuthenticationFailed'
    ] as (params: { reason: string }) => void;

    onAuthenticationFailed({ reason: 'jwt expired' });
    onAuthenticationFailed({ reason: 'jwt expired' });

    resolveRefresh?.('refreshed');

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(provider.destroy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not fire onSessionExpired when the hook unmounts while refresh is in-flight and then resolves false', async () => {
    let resolveRefresh: ((value: RefreshOutcome) => void) | undefined;
    const onAuthRefresh = vi.fn(
      () =>
        new Promise<RefreshOutcome>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    const onSessionExpired = vi.fn();

    const { unmount } = renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://localhost:3333/collaboration',
        onAuthRefresh,
        onSessionExpired,
      })
    );

    const provider = mockProviderInstances[0];
    const onAuthenticationFailed = provider.options[
      'onAuthenticationFailed'
    ] as (params: { reason: string }) => void;

    onAuthenticationFailed({ reason: 'jwt expired' });
    unmount();
    resolveRefresh?.('rejected');

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not fire onSessionExpired when the hook unmounts while refresh is in-flight and then throws', async () => {
    let rejectRefresh: ((reason: Error) => void) | undefined;
    const onAuthRefresh = vi.fn(
      () =>
        new Promise<RefreshOutcome>((_, reject) => {
          rejectRefresh = reject;
        })
    );
    const onSessionExpired = vi.fn();

    const { unmount } = renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://localhost:3333/collaboration',
        onAuthRefresh,
        onSessionExpired,
      })
    );

    const provider = mockProviderInstances[0];
    const onAuthenticationFailed = provider.options[
      'onAuthenticationFailed'
    ] as (params: { reason: string }) => void;

    onAuthenticationFailed({ reason: 'jwt expired' });
    unmount();
    rejectRefresh?.(new Error('network down'));

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
