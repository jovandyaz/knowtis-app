import { describe, expect, it, vi } from 'vitest';

import { GENERAL_ACCESS, PERMISSION } from '@knowtis/shared-types';

import type { NoteRepository } from '../../notes/domain';
import { HocuspocusAuthExtension } from './hocuspocus-auth.extension';

interface CallPayload {
  token: string;
  documentName: string;
  connectionConfig: { readOnly: boolean; isAuthenticated: boolean };
}

const buildPayload = (token: string, readOnly = false): CallPayload => ({
  token,
  documentName: 'note-1',
  connectionConfig: { readOnly, isAuthenticated: false },
});

describe('HocuspocusAuthExtension', () => {
  it('should reject connection without token', async () => {
    const ext = new HocuspocusAuthExtension(
      { verify: vi.fn() } as never,
      { findById: vi.fn() } as never,
      { findById: vi.fn() } as unknown as NoteRepository
    );

    const extension = ext.toExtension();
    await expect(
      extension.onAuthenticate?.(buildPayload('') as never)
    ).rejects.toThrow('Authentication required');
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
    ).rejects.toThrow('Forbidden');
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
    ).rejects.toThrow('Invalid token');
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
    ).rejects.toThrow('Note not found');
  });
});
