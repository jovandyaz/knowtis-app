import { MessageType } from '@hocuspocus/provider';
import { act, renderHook } from '@testing-library/react';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import { writeSyncStep2 } from 'y-protocols/sync';
import * as Y from 'yjs';

import {
  COLLABORATION_CLOSE_REASON,
  HANDSHAKE_FAILURE,
} from '@knowtis/shared-types';

import { useHocuspocusCollaboration } from '../useHocuspocusCollaboration';

const NOTE_ID = 'transport-recovery';

/** Only the network boundary is controlled: the hook, provider, retry timers,
 *  authentication messages, and Yjs synchronization use their actual code. */
class ControlledWebSocket extends EventTarget {
  static instances: ControlledWebSocket[] = [];
  static onOpen: (socket: ControlledWebSocket) => void = () => undefined;
  readyState = 0;
  binaryType = 'arraybuffer';
  readonly sent: Uint8Array[] = [];

  constructor(_url: string) {
    super();
    ControlledWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.readyState === 3) {
        return;
      }
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
      this.receive(new Uint8Array([MessageType.Ping]));
      ControlledWebSocket.onOpen(this);
    }, 10);
  }

  send(data: Uint8Array) {
    this.sent.push(new Uint8Array(data));
  }

  close() {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    queueMicrotask(() =>
      this.dispatchEvent(new CloseEvent('close', { code: 1000 }))
    );
  }

  serverClose(code: number, reason: string) {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code, reason }));
  }

  receive(data: Uint8Array) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  get authenticationAttempts() {
    return this.sent.filter((data) => {
      if (data.length === 1) {
        return false;
      }
      const decoder = decoding.createDecoder(data);
      decoding.readVarString(decoder);
      return decoding.readVarUint(decoder) === MessageType.Auth;
    }).length;
  }
}

function message(
  type: MessageType,
  write: (encoder: encoding.Encoder) => void
) {
  const encoder = encoding.createEncoder();
  encoding.writeVarString(encoder, NOTE_ID);
  encoding.writeVarUint(encoder, type);
  write(encoder);
  return encoding.toUint8Array(encoder);
}

function authenticateAndSync(
  socket: ControlledWebSocket,
  scope = 'read-write'
) {
  socket.receive(
    message(MessageType.Auth, (encoder) => {
      encoding.writeVarUint(encoder, 2); // Hocuspocus authenticated response.
      encoding.writeVarString(encoder, scope);
    })
  );
  const serverDoc = new Y.Doc();
  socket.receive(
    message(MessageType.Sync, (encoder) => writeSyncStep2(encoder, serverDoc))
  );
  serverDoc.destroy();
}

describe('useHocuspocusCollaboration — actual transport recovery', () => {
  let yDoc: Y.Doc;
  let awareness: Awareness;
  let unmount: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', ControlledWebSocket);
    ControlledWebSocket.instances = [];
    ControlledWebSocket.onOpen = () => undefined;
    yDoc = new Y.Doc();
    awareness = new Awareness(yDoc);
    yDoc.getMap('draft').set('text', 'keep');
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
    awareness.destroy();
    yDoc.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function mount() {
    const onSessionExpired = vi.fn();
    const onAuthRefresh = vi.fn();
    const hook = renderHook(() =>
      useHocuspocusCollaboration({
        noteId: NOTE_ID,
        yDoc,
        awareness,
        serverUrl: 'ws://controlled',
        onSessionExpired,
        onAuthRefresh,
      })
    );
    unmount = hook.unmount;
    return { ...hook, onSessionExpired, onAuthRefresh };
  }

  it.each([
    [4403, COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE],
    [1006, ''],
  ])(
    'bounds raw close %s to three recoveries and stays stopped',
    async (code, reason) => {
      ControlledWebSocket.onOpen = (socket) => {
        setTimeout(() => socket.serverClose(code, reason), 20);
      };
      const { result, onSessionExpired, onAuthRefresh } = mount();
      await act(async () => vi.advanceTimersByTimeAsync(30000));
      expect(ControlledWebSocket.instances).toHaveLength(4);
      expect(
        ControlledWebSocket.instances.reduce(
          (total, socket) => total + socket.authenticationAttempts,
          0
        )
      ).toBe(4);
      expect(result.current).toMatchObject({
        status: 'disconnected',
        readOnly: true,
        isSynced: false,
      });
      expect(yDoc.getMap('draft').get('text')).toBe('keep');
      expect(awareness.doc).toBe(yDoc);
      expect(onSessionExpired).not.toHaveBeenCalled();
      expect(onAuthRefresh).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(30000));
      expect(ControlledWebSocket.instances).toHaveLength(4);
    }
  );

  it('recovers an ordinary network close and synchronizes the same document', async () => {
    ControlledWebSocket.onOpen = (socket) => {
      if (ControlledWebSocket.instances.length === 1) {
        setTimeout(() => socket.serverClose(1006, ''), 20);
      } else {
        setTimeout(() => authenticateAndSync(socket), 1);
      }
    };
    const { result } = mount();
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(ControlledWebSocket.instances).toHaveLength(2);
    expect(result.current).toMatchObject({
      status: 'connected',
      isSynced: true,
      readOnly: false,
    });
    expect(yDoc.getMap('draft').get('text')).toBe('keep');
  });

  it('cancels pending reconnects on unmount', async () => {
    ControlledWebSocket.onOpen = (socket) => {
      setTimeout(
        () =>
          socket.serverClose(
            4403,
            COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE
          ),
        20
      );
    };
    const hook = mount();
    await act(async () => vi.advanceTimersByTimeAsync(40));
    hook.unmount();
    unmount = undefined;
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(ControlledWebSocket.instances).toHaveLength(1);
  });

  it('stops terminal document denial without expiring the user session', async () => {
    ControlledWebSocket.onOpen = (socket) => {
      socket.receive(
        message(MessageType.Auth, (encoder) => {
          encoding.writeVarUint(encoder, 1); // Hocuspocus permission-denied response.
          encoding.writeVarString(encoder, HANDSHAKE_FAILURE.FORBIDDEN);
        })
      );
    };
    const { result, onSessionExpired, onAuthRefresh } = mount();
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(ControlledWebSocket.instances).toHaveLength(1);
    expect(result.current.status).toBe('accessDenied');
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(onAuthRefresh).not.toHaveBeenCalled();
  });

  it('reauthenticates a document close over the healthy socket and retains awareness', async () => {
    ControlledWebSocket.onOpen = (socket) => {
      setTimeout(() => authenticateAndSync(socket), 1);
    };
    const { result } = mount();
    const destroyAwareness = vi.spyOn(awareness, 'destroy');
    await act(async () => vi.advanceTimersByTimeAsync(20));
    const socket = ControlledWebSocket.instances[0];
    expect(result.current.isSynced).toBe(true);
    await act(async () => {
      socket.receive(
        message(MessageType.CLOSE, (encoder) =>
          encoding.writeVarString(
            encoder,
            COLLABORATION_CLOSE_REASON.ACCESS_CHANGED
          )
        )
      );
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(socket.authenticationAttempts).toBe(2);
    await act(async () => {
      authenticateAndSync(socket, 'readonly');
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(ControlledWebSocket.instances).toHaveLength(1);
    expect(result.current).toMatchObject({
      status: 'connected',
      readOnly: true,
      isSynced: true,
    });
    expect(yDoc.getMap('draft').get('text')).toBe('keep');
    expect(destroyAwareness).not.toHaveBeenCalled();
  });
});
