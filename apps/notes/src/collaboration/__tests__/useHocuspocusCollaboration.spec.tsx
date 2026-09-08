import { HocuspocusProvider } from '@hocuspocus/provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import type { RefreshOutcome } from '@knowtis/api-client';
import {
  COLLABORATION_CLOSE_REASON,
  HANDSHAKE_FAILURE,
} from '@knowtis/shared-types';

import { useHocuspocusCollaboration } from '../useHocuspocusCollaboration';

const mockProviderInstances: Array<{
  options: Record<string, unknown>;
  destroy: ReturnType<typeof vi.fn>;
  sendToken: ReturnType<typeof vi.fn>;
  startSync: ReturnType<typeof vi.fn>;
  websocketProvider: {
    status: string;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
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
    const instance = {
      options,
      configuration: { websocketProvider: undefined as unknown },
      destroy: vi.fn(),
      sendToken: vi.fn().mockResolvedValue(undefined),
      startSync: vi.fn(),
      websocketProvider: {
        status: 'connected',
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
      },
    };
    instance.configuration.websocketProvider = instance.websocketProvider;
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

  afterEach(() => {
    vi.useRealTimers();
    awareness.destroy();
    yDoc.destroy();
  });

  it.each([1000, 4403])(
    'reauthenticates document close %s once while preserving document and awareness',
    async (code) => {
      const onAccessChanged = vi.fn();
      const onSessionExpired = vi.fn();
      yDoc.getMap('local').set('unsent', 'keep');
      const { result } = renderHook(() =>
        useHocuspocusCollaboration({
          noteId: 'note-1',
          yDoc,
          awareness,
          serverUrl: 'ws://test',
          onAccessChanged,
          onSessionExpired,
        })
      );
      const provider = mockProviderInstances[0];
      const close = provider.options['onClose'] as (p: {
        event: { code: number; reason: string };
      }) => void;
      act(() => {
        close?.({
          event: { code, reason: COLLABORATION_CLOSE_REASON.ACCESS_CHANGED },
        });
        close?.({
          event: { code, reason: COLLABORATION_CLOSE_REASON.ACCESS_CHANGED },
        });
      });
      expect(result.current.readOnly).toBe(true);
      expect(result.current.isSynced).toBe(false);
      await waitFor(() => expect(provider.sendToken).toHaveBeenCalledTimes(1));
      act(() => {
        (provider.options['onAuthenticated'] as (p: { scope: string }) => void)(
          { scope: 'readonly' }
        );
      });
      expect(result.current.readOnly).toBe(true);
      expect(provider.startSync).toHaveBeenCalledTimes(1);
      expect(yDoc.getMap('local').get('unsent')).toBe('keep');
      expect(awareness.doc).toBe(yDoc);
      expect(provider.destroy).not.toHaveBeenCalled();
      expect(onAccessChanged).toHaveBeenCalled();
      expect(onSessionExpired).not.toHaveBeenCalled();
    }
  );

  it('bounds transient authority retries without destroying local collaboration state', async () => {
    vi.useFakeTimers();
    const onSessionExpired = vi.fn();
    const { result } = renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://test',
        onSessionExpired,
      })
    );
    const provider = mockProviderInstances[0];
    const close = provider.options['onClose'] as (p: {
      event: { code: number; reason: string };
    }) => void;
    await act(async () => {
      close?.({
        event: {
          code: 1000,
          reason: COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE,
        },
      });
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(provider.sendToken).toHaveBeenCalledTimes(3);
    expect(provider.websocketProvider.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('disconnected');
    expect(result.current.readOnly).toBe(true);
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('bounds recovery when authentication succeeds but hydration never synchronizes', async () => {
    vi.useFakeTimers();
    const onSessionExpired = vi.fn();
    const { result } = renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://test',
        onSessionExpired,
      })
    );
    const provider = mockProviderInstances[0];
    const authenticated = provider.options['onAuthenticated'] as (p: {
      scope: string;
    }) => void;
    const close = provider.options['onClose'] as (p: {
      event: { code: number; reason: string };
    }) => void;
    provider.sendToken.mockImplementation(async () =>
      authenticated({ scope: 'read-write' })
    );
    yDoc.getMap('local').set('draft', 'keep');
    const destroyAwareness = vi.spyOn(awareness, 'destroy');
    await act(async () => {
      close({
        event: {
          code: 1000,
          reason: COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE,
        },
      });
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(provider.sendToken).toHaveBeenCalledTimes(3);
    expect(provider.startSync).toHaveBeenCalledTimes(3);
    expect(provider.websocketProvider.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('disconnected');
    expect(result.current.isSynced).toBe(false);
    expect(yDoc.getMap('local').get('draft')).toBe('keep');
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(destroyAwareness).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('clears the full recovery deadline only after successful synchronization', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://test',
      })
    );
    const provider = mockProviderInstances[0];
    const authenticated = provider.options['onAuthenticated'] as (p: {
      scope: string;
    }) => void;
    const synced = provider.options['onSynced'] as (p: {
      state: boolean;
    }) => void;
    const close = provider.options['onClose'] as (p: {
      event: { code: number; reason: string };
    }) => void;
    await act(async () => {
      close({
        event: {
          code: 1000,
          reason: COLLABORATION_CLOSE_REASON.ACCESS_CHANGED,
        },
      });
      await vi.advanceTimersByTimeAsync(10);
      authenticated({ scope: 'read-write' });
      await vi.advanceTimersByTimeAsync(1000);
      synced({ state: true });
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(provider.sendToken).toHaveBeenCalledTimes(1);
    expect(provider.startSync).toHaveBeenCalledTimes(1);
    expect(provider.websocketProvider.disconnect).not.toHaveBeenCalled();
    expect(result.current.status).toBe('connected');
    expect(result.current.isSynced).toBe(true);
  });

  it('stops stale link retries on a terminal reauthentication verdict', async () => {
    const onSessionExpired = vi.fn();
    const { result } = renderHook(() =>
      useHocuspocusCollaboration({
        noteId: 'note-1',
        yDoc,
        awareness,
        serverUrl: 'ws://test',
        onSessionExpired,
      })
    );
    const provider = mockProviderInstances[0];
    const fail = provider.options['onAuthenticationFailed'] as (p: {
      reason: string;
    }) => void;
    act(() => {
      fail({ reason: HANDSHAKE_FAILURE.FORBIDDEN });
    });
    expect(result.current.status).toBe('accessDenied');
    expect(result.current.readOnly).toBe(true);
    expect(provider.websocketProvider.disconnect).toHaveBeenCalledTimes(1);
    expect(provider.sendToken).not.toHaveBeenCalled();
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
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

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });
    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });

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

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });

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

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });

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

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });

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

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });
    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });
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

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });
    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });

    await act(async () => {
      resolveRefresh?.('refreshed');
    });

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

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.FORBIDDEN });
    });

    await waitFor(() => {
      expect(result.current.status).toBe('accessDenied');
    });
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(provider.websocketProvider.disconnect).toHaveBeenCalledTimes(1);
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

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INTERNAL_ERROR });
    });

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

    await act(async () => {
      onAuthenticationFailed({ reason: 'permission-denied' });
    });

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

    await act(async () => {
      onAuthenticationFailed({ reason: HANDSHAKE_FAILURE.INVALID_TOKEN });
    });
    unmount();
    await act(async () => {
      resolveRefresh?.('rejected');
    });

    await waitFor(() => {
      expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
