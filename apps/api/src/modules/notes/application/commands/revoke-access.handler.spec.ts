import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteRepository } from '../../domain/ports';
import { PermissionLevel } from '../../domain/value-objects/permission-level.vo';
import { RevokeAccessHandler } from './revoke-access.handler';

describe('RevokeAccessHandler', () => {
  const repo = {
    findById: vi.fn(),
    findPermission: vi.fn(),
    deletePermission: vi.fn(),
  };
  const events = new EventEmitter2();
  const handler = new RevokeAccessHandler(
    repo as unknown as NoteRepository,
    events
  );
  const revoke = (userId: string, targetUserId = 'viewer') =>
    handler.execute({ noteId: 'note', userId, targetUserId });
  beforeEach(() => {
    vi.resetAllMocks();
    repo.findById.mockResolvedValue({
      ownerId: 'owner',
      editorsCanShare: true,
    });
    repo.findPermission.mockResolvedValue({
      permission: PermissionLevel.create('editor')._unsafeUnwrap(),
    });
    repo.deletePermission.mockResolvedValue(ok(true));
  });
  it('publishes only a committed revocation and cannot fail the saved change when delivery throws', async () => {
    const delivered: unknown[] = [];
    events.on('note.access-changed', (event) => {
      delivered.push(event);
      throw new Error('delivery failed');
    });
    expect((await revoke('owner')).isOk()).toBe(true);
    expect(delivered).toEqual([expect.objectContaining({ noteId: 'note' })]);
    repo.deletePermission.mockResolvedValue(
      err({ code: 'FAILED', message: 'failed' })
    );
    await revoke('owner');
    expect(delivered).toHaveLength(1);
    events.removeAllListeners();
  });
  it.each(['owner', 'direct-editor'])(
    'lets %s revoke a non-owner',
    async (actor) => expect((await revoke(actor)).isOk()).toBe(true)
  );
  it.each(['owner', 'direct-editor'])(
    'protects owner and self for %s',
    async (actor) => {
      expect((await revoke(actor, 'owner'))._unsafeUnwrapErr().code).toBe(
        'PERSON_NOT_ADDABLE'
      );
      expect((await revoke(actor, actor))._unsafeUnwrapErr().code).toBe(
        'PERSON_NOT_ADDABLE'
      );
      expect(repo.deletePermission).not.toHaveBeenCalled();
    }
  );
  it('does not authorize link editors', async () => {
    repo.findPermission.mockResolvedValue(null);
    expect((await revoke('link-editor'))._unsafeUnwrapErr().code).toBe(
      'PERMISSION_DENIED'
    );
  });
  it('returns missing note before permission lookup or revocation', async () => {
    repo.findById.mockResolvedValue(null);
    expect((await revoke('owner'))._unsafeUnwrapErr().code).toBe(
      'NOTE_NOT_FOUND'
    );
    expect(repo.findPermission).not.toHaveBeenCalled();
    expect(repo.deletePermission).not.toHaveBeenCalled();
  });
  it('honors editorsCanShare', async () => {
    repo.findById.mockResolvedValue({
      ownerId: 'owner',
      editorsCanShare: false,
    });
    expect((await revoke('editor'))._unsafeUnwrapErr().code).toBe(
      'PERMISSION_DENIED'
    );
  });
});
