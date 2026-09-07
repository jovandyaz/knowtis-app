import { describe, expect, it, vi } from 'vitest';

import { HANDSHAKE_FAILURE } from '@knowtis/shared-types';

import type { AccessSnapshot } from '../../notes/domain/access-policy';
import { shareTokenFingerprint } from '../../notes/domain/share-token-fingerprint';
import { HocuspocusAuthExtension } from './hocuspocus-auth.extension';

const snapshot: AccessSnapshot = {
  ownerId: 'owner',
  generalAccess: 'anyone_with_link',
  generalAccessPermission: 'editor',
  shareTokenFingerprint: shareTokenFingerprint('current'),
  directPermissions: [
    { userId: 'reader', permission: 'viewer' },
    { userId: 'editor', permission: 'editor' },
  ],
};
function setup(userId = 'guest', role = 'user', isAnonymous = false) {
  const verify = vi.fn().mockReturnValue({ sub: userId, exp: 123456 });
  const users = {
    findById: vi.fn().mockResolvedValue({ id: userId, role, isAnonymous }),
  };
  const repository = {
    findAccessSnapshot: vi.fn().mockResolvedValue(snapshot),
  };
  const payload = {
    token: 'jwt',
    documentName: 'note',
    connectionConfig: { readOnly: false, isAuthenticated: false },
    requestParameters: new URLSearchParams(),
  };
  const extension = new HocuspocusAuthExtension(
    { verify } as never,
    users as never,
    repository
  ).toExtension();
  return {
    verify,
    users,
    repository,
    payload,
    authenticate: () => extension.onAuthenticate?.(payload as never),
  };
}
describe('HocuspocusAuthExtension access snapshots', () => {
  it.each(['owner', 'editor', 'reader'])(
    'retains direct %s access without a token',
    async (userId) => {
      const fixture = setup(userId);
      await fixture.authenticate();
      expect(fixture.payload.connectionConfig.readOnly).toBe(
        userId === 'reader'
      );
      expect(fixture.repository.findAccessSnapshot).toHaveBeenCalledWith(
        'note'
      );
    }
  );
  it.each([false, true])(
    'accepts a valid link for anonymous=%s',
    async (anonymous) => {
      const f = setup('guest', 'user', anonymous);
      f.payload.requestParameters.set('shareToken', 'current');
      await f.authenticate();
      expect(f.payload.connectionConfig.readOnly).toBe(false);
    }
  );
  it.each([undefined, 'stale'])(
    'rejects missing or stale token %s before public CASL read rule',
    async (token) => {
      const f = setup();
      if (token) {
        f.payload.requestParameters.set('shareToken', token);
      }
      await expect(f.authenticate()).rejects.toMatchObject({
        reason: HANDSHAKE_FAILURE.FORBIDDEN,
      });
    }
  );
  it('keeps a direct viewer after invalidating its link editing', async () => {
    const f = setup('reader');
    f.payload.requestParameters.set('shareToken', 'stale');
    await f.authenticate();
    expect(f.payload.connectionConfig.readOnly).toBe(true);
  });
  it('ignores tokens on a restricted note', async () => {
    const f = setup();
    f.repository.findAccessSnapshot.mockResolvedValue({
      ...snapshot,
      generalAccess: 'restricted',
    });
    f.payload.requestParameters.set('shareToken', 'current');
    await expect(f.authenticate()).rejects.toThrow(HANDSHAKE_FAILURE.FORBIDDEN);
  });
  it('preserves administrator read and edit without treating it as ownership', async () => {
    const f = setup('admin-id', 'admin');
    await f.authenticate();
    expect(f.payload.connectionConfig.readOnly).toBe(false);
  });
  it('requires an authentication token with a wire-readable reason', async () => {
    const f = setup();
    f.payload.token = '';
    await expect(f.authenticate()).rejects.toMatchObject({
      reason: HANDSHAKE_FAILURE.AUTH_REQUIRED,
    });
  });
  it('pins HS256 and propagates expiry', async () => {
    const f = setup('owner');
    expect(await f.authenticate()).toMatchObject({
      tokenExpiresAtMs: 123456000,
    });
    expect(f.verify).toHaveBeenCalledWith('jwt', { algorithms: ['HS256'] });
  });
  it('rejects MCP issued tokens before reading access', async () => {
    const f = setup();
    f.verify.mockReturnValue({ sub: 'guest', source: 'mcp' });
    await expect(f.authenticate()).rejects.toThrow(HANDSHAKE_FAILURE.FORBIDDEN);
    expect(f.repository.findAccessSnapshot).not.toHaveBeenCalled();
  });
  it('rejects invalid JWT', async () => {
    const f = setup();
    f.verify.mockImplementation(() => {
      throw new Error('invalid JWT');
    });
    await expect(f.authenticate()).rejects.toThrow(
      HANDSHAKE_FAILURE.INVALID_TOKEN
    );
  });
  it.each(['absent', 'failure'])('rejects a %s user', async (mode) => {
    const f = setup();
    if (mode === 'absent') {
      f.users.findById.mockResolvedValue(null);
    } else {
      f.users.findById.mockRejectedValue(new Error('database details'));
    }
    await expect(f.authenticate()).rejects.toThrow(
      HANDSHAKE_FAILURE.INVALID_TOKEN
    );
  });
  it('reports a missing note', async () => {
    const f = setup();
    f.repository.findAccessSnapshot.mockResolvedValue(null);
    await expect(f.authenticate()).rejects.toThrow(
      HANDSHAKE_FAILURE.NOTE_NOT_FOUND
    );
  });
  it('masks database errors', async () => {
    const f = setup();
    f.repository.findAccessSnapshot.mockRejectedValue(
      new Error('private connection details')
    );
    await expect(f.authenticate()).rejects.toThrow(
      HANDSHAKE_FAILURE.INTERNAL_ERROR
    );
  });
  describe('connected hook token expiry', () => {
    function makeConnection() {
      const closeCallbacks: Array<() => void> = [];
      return {
        close: vi.fn(() => {
          for (const cb of closeCallbacks) {
            cb();
          }
        }),
        onClose: vi.fn((cb: () => void) => {
          closeCallbacks.push(cb);
        }),
      };
    }

    function makeExtension() {
      return new HocuspocusAuthExtension(
        { verify: vi.fn() } as never,
        { findById: vi.fn() } as never,
        { findAccessSnapshot: vi.fn() }
      );
    }

    it('closes the connection when the token expiry passes', async () => {
      vi.useFakeTimers();
      try {
        const connection = makeConnection();
        const context = {
          user: { id: 'user-1', isAnonymous: false },
          noteId: 'note-1',
          tokenExpiresAtMs: Date.now() + 60_000,
        };

        await makeExtension()
          .toExtension()
          .connected?.({ context, connection } as never);

        vi.advanceTimersByTime(60_000 + 5_000 + 1_000);

        expect(connection.close).toHaveBeenCalledWith(
          expect.objectContaining({ code: 4401 })
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears the timer when the connection closes before expiry', async () => {
      vi.useFakeTimers();
      try {
        const connection = makeConnection();
        const context = {
          user: { id: 'user-1', isAnonymous: false },
          noteId: 'note-1',
          tokenExpiresAtMs: Date.now() + 60_000,
        };

        await makeExtension()
          .toExtension()
          .connected?.({ context, connection } as never);

        const closeCallback = connection.onClose.mock.calls[0]?.[0];
        closeCallback?.();

        vi.advanceTimersByTime(120_000);

        expect(connection.close).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not arm a timer when the context has no expiry', async () => {
      vi.useFakeTimers();
      try {
        const connection = makeConnection();
        const context = {
          user: { id: 'user-1', isAnonymous: false },
          noteId: 'note-1',
        };

        await makeExtension()
          .toExtension()
          .connected?.({ context, connection } as never);

        expect(vi.getTimerCount()).toBe(0);
        expect(connection.onClose).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
