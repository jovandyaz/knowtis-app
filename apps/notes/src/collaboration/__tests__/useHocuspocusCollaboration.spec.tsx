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
});
