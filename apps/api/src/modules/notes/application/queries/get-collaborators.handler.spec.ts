import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteRepository } from '../../domain/ports';
import { PermissionLevel } from '../../domain/value-objects/permission-level.vo';
import { GetCollaboratorsHandler } from './get-collaborators.handler';

describe('GetCollaboratorsHandler', () => {
  const people = [
    {
      user: {
        id: 'owner',
        name: 'Owner',
        email: 'owner@example.test',
        avatarUrl: null,
      },
      permission: 'owner',
    },
  ];
  const repo = {
    findById: vi.fn(),
    findPermission: vi.fn(),
    findPeopleByNote: vi.fn(),
  };
  const handler = new GetCollaboratorsHandler(
    repo as unknown as NoteRepository
  );
  const list = (userId: string) => handler.execute({ noteId: 'note', userId });
  beforeEach(() => {
    vi.resetAllMocks();
    repo.findById.mockResolvedValue({
      ownerId: 'owner',
      editorsCanShare: true,
    });
    repo.findPermission.mockResolvedValue({
      permission: PermissionLevel.create('editor')._unsafeUnwrap(),
    });
    repo.findPeopleByNote.mockResolvedValue(people);
  });
  it.each(['owner', 'direct-editor'])(
    'lets %s list the public People projection',
    async (actor) => expect((await list(actor))._unsafeUnwrap()).toEqual(people)
  );
  it('denies non-direct access before reading personal details', async () => {
    repo.findPermission.mockResolvedValue(null);
    expect((await list('link-editor'))._unsafeUnwrapErr().code).toBe(
      'PERMISSION_DENIED'
    );
    expect(repo.findPeopleByNote).not.toHaveBeenCalled();
  });
  it('returns missing note before permission or personal-details lookup', async () => {
    repo.findById.mockResolvedValue(null);
    expect((await list('owner'))._unsafeUnwrapErr().code).toBe(
      'NOTE_NOT_FOUND'
    );
    expect(repo.findPermission).not.toHaveBeenCalled();
    expect(repo.findPeopleByNote).not.toHaveBeenCalled();
  });
  it('does not allow a direct editor when sharing is disabled', async () => {
    repo.findById.mockResolvedValue({
      ownerId: 'owner',
      editorsCanShare: false,
    });
    expect((await list('editor'))._unsafeUnwrapErr().code).toBe(
      'PERMISSION_DENIED'
    );
  });
});
