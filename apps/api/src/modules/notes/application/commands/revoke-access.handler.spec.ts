import { ok } from 'neverthrow';
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
  const handler = new RevokeAccessHandler(repo as unknown as NoteRepository);
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
