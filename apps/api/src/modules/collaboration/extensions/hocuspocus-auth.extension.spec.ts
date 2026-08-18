import { describe, expect, it, vi } from 'vitest';

import {
  GENERAL_ACCESS,
  HANDSHAKE_FAILURE,
  PERMISSION,
} from '@knowtis/shared-types';

import type { NoteRepository } from '../../notes/domain';
import { HocuspocusAuthExtension } from './hocuspocus-auth.extension';

interface CallPayload {
  token: string;
  documentName: string;
  connectionConfig: { readOnly: boolean; isAuthenticated: boolean };
  requestParameters: URLSearchParams;
}

const buildPayload = (
  token: string,
  options: { readOnly?: boolean; shareToken?: string } = {}
): CallPayload => ({
  token,
  documentName: 'note-1',
  connectionConfig: {
    readOnly: options.readOnly ?? false,
    isAuthenticated: false,
  },
  requestParameters: new URLSearchParams(
    options.shareToken ? { shareToken: options.shareToken } : {}
  ),
});

describe('HocuspocusAuthExtension', () => {
  it('should reject with errors that carry the reason where hocuspocus reads it', async () => {
    const ext = new HocuspocusAuthExtension(
      { verify: vi.fn() } as never,
      { findById: vi.fn() } as never,
      { findById: vi.fn() } as unknown as NoteRepository
    );

    const extension = ext.toExtension();
    const thrown = await extension
      .onAuthenticate?.(buildPayload('') as never)
      .then(() => null)
      .catch((error: unknown) => error);

    // @hocuspocus/server transmits `error.reason ?? 'permission-denied'` to the
    // client; an error without the property collapses every rejection into one.
    expect(thrown).toMatchObject({ reason: HANDSHAKE_FAILURE.AUTH_REQUIRED });
  });

  it('should reject connection without token', async () => {
    const ext = new HocuspocusAuthExtension(
      { verify: vi.fn() } as never,
      { findById: vi.fn() } as never,
      { findById: vi.fn() } as unknown as NoteRepository
    );

    const extension = ext.toExtension();
    await expect(
      extension.onAuthenticate?.(buildPayload('') as never)
    ).rejects.toThrow(HANDSHAKE_FAILURE.AUTH_REQUIRED);
  });

  it('should set readOnly when user can read but not update', async () => {
    const note = {
      id: 'note-1',
      ownerId: 'other-user',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    };
    const noteRepository = {
      findById: vi.fn().mockResolvedValue(note),
      findPermissionsByNote: vi.fn().mockResolvedValue([
        {
          permission: {
            noteId: 'note-1',
            userId: 'user-1',
            permission: { value: PERMISSION.VIEWER },
          },
        },
      ]),
    } as unknown as NoteRepository;

    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'user-1', email: 'u@example.com' }),
      } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', isAnonymous: false }),
      } as never,
      noteRepository
    );

    const payload = buildPayload('valid-token');
    await ext.toExtension().onAuthenticate?.(payload as never);

    expect(payload.connectionConfig.readOnly).toBe(true);
  });

  it('should reject when user has no read permission', async () => {
    const note = {
      id: 'note-1',
      ownerId: 'other-user',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    };
    const noteRepository = {
      findById: vi.fn().mockResolvedValue(note),
      findPermissionsByNote: vi.fn().mockResolvedValue([]),
    } as unknown as NoteRepository;

    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'user-1', email: 'u@example.com' }),
      } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', isAnonymous: false }),
      } as never,
      noteRepository
    );

    await expect(
      ext.toExtension().onAuthenticate?.(buildPayload('valid-token') as never)
    ).rejects.toThrow(HANDSHAKE_FAILURE.FORBIDDEN);
  });

  it('should reject MCP-source tokens', async () => {
    const ext = new HocuspocusAuthExtension(
      {
        verify: vi.fn().mockReturnValue({
          sub: 'user-1',
          email: 'u@example.com',
          source: 'mcp',
        }),
      } as never,
      { findById: vi.fn() } as never,
      { findById: vi.fn() } as unknown as NoteRepository
    );

    await expect(
      ext.toExtension().onAuthenticate?.(buildPayload('mcp-token') as never)
    ).rejects.toThrow(HANDSHAKE_FAILURE.FORBIDDEN);
  });

  it('should reject when token is invalid', async () => {
    const ext = new HocuspocusAuthExtension(
      {
        verify: vi.fn().mockImplementation(() => {
          throw new Error('jwt malformed');
        }),
      } as never,
      { findById: vi.fn() } as never,
      { findById: vi.fn() } as unknown as NoteRepository
    );

    await expect(
      ext.toExtension().onAuthenticate?.(buildPayload('bad-token') as never)
    ).rejects.toThrow(HANDSHAKE_FAILURE.INVALID_TOKEN);
  });

  it('should reject with Invalid token when JWT is valid but user no longer exists', async () => {
    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'user-deleted', email: 'u@example.com' }),
      } as never,
      { findById: vi.fn().mockResolvedValue(null) } as never,
      {
        findById: vi.fn(),
        findPermissionsByNote: vi.fn(),
      } as unknown as NoteRepository
    );

    await expect(
      ext.toExtension().onAuthenticate?.(buildPayload('valid-token') as never)
    ).rejects.toThrow(HANDSHAKE_FAILURE.INVALID_TOKEN);
  });

  it('should mask raw repository errors as Internal server error', async () => {
    const noteRepository = {
      findById: vi.fn().mockRejectedValue(new Error('DB connection refused')),
      findPermissionsByNote: vi
        .fn()
        .mockRejectedValue(new Error('DB connection refused')),
    } as unknown as NoteRepository;

    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'user-1', email: 'u@example.com' }),
      } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', isAnonymous: false }),
      } as never,
      noteRepository
    );

    await expect(
      ext.toExtension().onAuthenticate?.(buildPayload('valid-token') as never)
    ).rejects.toThrow('Internal server error');
  });

  it('should reject when note is not found', async () => {
    const noteRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findPermissionsByNote: vi.fn(),
    } as unknown as NoteRepository;

    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'user-1', email: 'u@example.com' }),
      } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', isAnonymous: false }),
      } as never,
      noteRepository
    );

    await expect(
      ext.toExtension().onAuthenticate?.(buildPayload('valid-token') as never)
    ).rejects.toThrow(HANDSHAKE_FAILURE.NOTE_NOT_FOUND);
  });

  it('should grant editor access via valid share token on a public note', async () => {
    const note = {
      id: 'note-1',
      ownerId: 'other-user',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
      generalAccessPermission: PERMISSION.EDITOR,
      shareToken: 'share-secret',
    };
    const noteRepository = {
      findById: vi.fn().mockResolvedValue(note),
      findPermissionsByNote: vi.fn().mockResolvedValue([]),
    } as unknown as NoteRepository;

    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'user-1', email: 'u@example.com' }),
      } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', isAnonymous: false }),
      } as never,
      noteRepository
    );

    const payload = buildPayload('valid-token', { shareToken: 'share-secret' });
    await ext.toExtension().onAuthenticate?.(payload as never);

    expect(payload.connectionConfig.readOnly).toBe(false);
  });

  it('should grant a guest editor access via a valid share token', async () => {
    const note = {
      id: 'note-1',
      ownerId: 'other-user',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
      generalAccessPermission: PERMISSION.EDITOR,
      shareToken: 'share-secret',
    };
    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'guest-1', email: '', isAnonymous: true }),
      } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'guest-1', isAnonymous: true }),
      } as never,
      {
        findById: vi.fn().mockResolvedValue(note),
        findPermissionsByNote: vi.fn().mockResolvedValue([]),
      } as unknown as NoteRepository
    );

    const payload = buildPayload('guest-token', { shareToken: 'share-secret' });
    await ext.toExtension().onAuthenticate?.(payload as never);

    expect(payload.connectionConfig.readOnly).toBe(false);
  });

  it('should keep a guest read-only when the share token is stale', async () => {
    const note = {
      id: 'note-1',
      ownerId: 'other-user',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
      generalAccessPermission: PERMISSION.EDITOR,
      shareToken: 'share-secret',
    };
    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'guest-1', email: '', isAnonymous: true }),
      } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'guest-1', isAnonymous: true }),
      } as never,
      {
        findById: vi.fn().mockResolvedValue(note),
        findPermissionsByNote: vi.fn().mockResolvedValue([]),
      } as unknown as NoteRepository
    );

    const payload = buildPayload('guest-token', { shareToken: 'wrong-secret' });
    await ext.toExtension().onAuthenticate?.(payload as never);

    expect(payload.connectionConfig.readOnly).toBe(true);
  });

  it('should verify tokens pinned to the HS256 algorithm', async () => {
    const verify = vi
      .fn()
      .mockReturnValue({ sub: 'user-1', email: 'u@example.com' });
    const note = {
      id: 'note-1',
      ownerId: 'user-1',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    };
    const ext = new HocuspocusAuthExtension(
      { verify } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', isAnonymous: false }),
      } as never,
      {
        findById: vi.fn().mockResolvedValue(note),
        findPermissionsByNote: vi.fn().mockResolvedValue([]),
      } as unknown as NoteRepository
    );

    await ext.toExtension().onAuthenticate?.(buildPayload('token') as never);

    expect(verify).toHaveBeenCalledWith('token', { algorithms: ['HS256'] });
  });

  it('should expose the token expiry in the connection context', async () => {
    const exp = Math.floor((Date.now() + 60_000) / 1000);
    const note = {
      id: 'note-1',
      ownerId: 'user-1',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    };
    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'user-1', email: 'u@example.com', exp }),
      } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', isAnonymous: false }),
      } as never,
      {
        findById: vi.fn().mockResolvedValue(note),
        findPermissionsByNote: vi.fn().mockResolvedValue([]),
      } as unknown as NoteRepository
    );

    const context = await ext
      .toExtension()
      .onAuthenticate?.(buildPayload('token') as never);

    expect(context).toMatchObject({ tokenExpiresAtMs: exp * 1000 });
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
        { findById: vi.fn() } as unknown as NoteRepository
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

  it('should ignore share token when it does not match the note', async () => {
    const note = {
      id: 'note-1',
      ownerId: 'other-user',
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
      generalAccessPermission: PERMISSION.EDITOR,
      shareToken: 'share-secret',
    };
    const noteRepository = {
      findById: vi.fn().mockResolvedValue(note),
      findPermissionsByNote: vi.fn().mockResolvedValue([]),
    } as unknown as NoteRepository;

    const ext = new HocuspocusAuthExtension(
      {
        verify: vi
          .fn()
          .mockReturnValue({ sub: 'user-1', email: 'u@example.com' }),
      } as never,
      {
        findById: vi
          .fn()
          .mockResolvedValue({ id: 'user-1', isAnonymous: false }),
      } as never,
      noteRepository
    );

    const payload = buildPayload('valid-token', {
      shareToken: 'wrong-token',
    });
    await ext.toExtension().onAuthenticate?.(payload as never);

    // Falls back to ANYONE_WITH_LINK ability, which is read-only.
    expect(payload.connectionConfig.readOnly).toBe(true);
  });
});
