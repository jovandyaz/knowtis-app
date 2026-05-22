import { HocuspocusProvider } from '@hocuspocus/provider';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

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
    const onAuthRefresh = vi.fn().mockResolvedValue(true);

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
    const onAuthRefresh = vi.fn().mockResolvedValue(false);
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

  it('destroys the provider when onAuthRefresh rejects', async () => {
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
      expect(provider.destroy).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('does not destroy the provider if a second auth failure fires while refresh is in-flight and refresh succeeds', async () => {
    let resolveRefresh: ((value: boolean) => void) | undefined;
    const onAuthRefresh = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
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

    resolveRefresh?.(true);

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(provider.destroy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not fire onSessionExpired when the hook unmounts while refresh is in-flight and then resolves false', async () => {
    let resolveRefresh: ((value: boolean) => void) | undefined;
    const onAuthRefresh = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
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
    resolveRefresh?.(false);

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
        new Promise<boolean>((_, reject) => {
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
