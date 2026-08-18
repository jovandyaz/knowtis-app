import { HocuspocusProvider } from '@hocuspocus/provider';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import type { RefreshOutcome } from '@knowtis/api-client';
import { HANDSHAKE_FAILURE } from '@knowtis/shared-types';

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

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });

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

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });

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

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });

    await waitFor(() => {
      expect(provider.destroy).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the provider alive when onAuthRefresh throws', async () => {
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

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('gives the attempt back so the next auth failure refreshes again', async () => {
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

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(2);
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

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });

    resolveRefresh?.('refreshed');

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(provider.destroy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('rules the note out on denial without touching the session', async () => {
    const onAuthRefresh = vi.fn().mockResolvedValue('refreshed');
    const onSessionExpired = vi.fn();

    const { result } = renderHook(() =>
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

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.FORBIDDEN });

    await waitFor(() => {
      expect(result.current.status).toBe('accessDenied');
    });
    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(onAuthRefresh).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('leaves a server fault to the reconnect without spending the refresh attempt', async () => {
    const onAuthRefresh = vi.fn().mockResolvedValue('refreshed');
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

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INTERNAL_ERROR });

    await Promise.resolve();
    await Promise.resolve();

    expect(onAuthRefresh).not.toHaveBeenCalled();
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('gives an unrecognised reason the refresh attempt, like an older server would need', async () => {
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
    const onAuthenticationFailed = provider.options[
      'onAuthenticationFailed'
    ] as (params: { reason: string }) => void;

    onAuthenticationFailed({ reason: 'permission-denied' });

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });
    expect(provider.destroy).not.toHaveBeenCalled();
  });

  it('does not fire onSessionExpired when the hook unmounts before a rejected refresh lands', async () => {
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

    onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
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
});
