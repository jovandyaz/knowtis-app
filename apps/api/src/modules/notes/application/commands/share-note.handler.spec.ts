import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserReadRepository } from '../../../users/domain/ports/user-read.repository';
import type { VerifiedIdentityPolicy } from '../../../users/verified-identity.policy';
import { NoteErrors } from '../../domain/errors/note.errors';
import type { NoteRepository } from '../../domain/ports';
import { PermissionLevel } from '../../domain/value-objects/permission-level.vo';
import { ShareNoteHandler } from './share-note.handler';

const person = {
  id: 'recipient',
  name: 'Recipient',
  email: 'recipient@example.test',
  avatarUrl: null,
  isAnonymous: false,
};
const grant = (permission: 'viewer' | 'editor', userId = 'recipient') => ({
  noteId: 'note',
  userId,
  permission: PermissionLevel.create(permission)._unsafeUnwrap(),
});
describe('ShareNoteHandler People contract', () => {
  const repo = {
    findById: vi.fn(),
    findPermission: vi.fn(),
    upsertPermission: vi.fn(),
  };
  const users = { findByEmail: vi.fn() };
  const verified = { isVerified: vi.fn() };
  const events = { emit: vi.fn() };
  let handler: ShareNoteHandler;
  beforeEach(() => {
    vi.resetAllMocks();
    repo.findById.mockResolvedValue({
      id: 'note',
      ownerId: 'owner',
      editorsCanShare: true,
    });
    repo.findPermission.mockResolvedValue(null);
    repo.upsertPermission.mockResolvedValue(ok(grant('viewer')));
    users.findByEmail.mockResolvedValue(person);
    verified.isVerified.mockResolvedValue(true);
    handler = new ShareNoteHandler(
      repo as unknown as NoteRepository,
      verified as unknown as VerifiedIdentityPolicy,
      events as unknown as EventEmitter2,
      users as unknown as UserReadRepository
    );
  });
  const share = (
    userId = 'owner',
    permission: 'viewer' | 'editor' = 'viewer',
    email = 'recipient@example.test'
  ) => handler.execute({ noteId: 'note', userId, email, permission });
  it('normalizes exact email and returns the public person projection', async () => {
    expect(
      (
        await share('owner', 'viewer', '  RECIPIENT@EXAMPLE.TEST  ')
      )._unsafeUnwrap()
    ).toEqual({
      user: {
        id: person.id,
        name: person.name,
        email: person.email,
        avatarUrl: null,
      },
      permission: 'viewer',
    });
    expect(users.findByEmail).toHaveBeenCalledWith(person.email);
  });
  it.each(['viewer', 'stranger', 'link-editor'])(
    'denies %s before recipient lookup',
    async (actor) => {
      repo.findPermission.mockResolvedValue(
        actor === 'viewer' ? grant('viewer', actor) : null
      );
      expect((await share(actor))._unsafeUnwrapErr().code).toBe(
        'PERMISSION_DENIED'
      );
      expect(users.findByEmail).not.toHaveBeenCalled();
    }
  );
  it('allows a direct editor when editorsCanShare is enabled', async () => {
    repo.findPermission.mockImplementation((_note, id) =>
      Promise.resolve(id.value === 'editor' ? grant('editor', 'editor') : null)
    );
    expect((await share('editor')).isOk()).toBe(true);
  });
  it('denies a direct editor when editorsCanShare is disabled', async () => {
    repo.findById.mockResolvedValue({
      id: 'note',
      ownerId: 'owner',
      editorsCanShare: false,
    });
    repo.findPermission.mockResolvedValue(grant('editor', 'editor'));
    expect((await share('editor'))._unsafeUnwrapErr().code).toBe(
      'PERMISSION_DENIED'
    );
    expect(users.findByEmail).not.toHaveBeenCalled();
  });
  it.each([null, { ...person, isAnonymous: true }, { ...person, id: 'owner' }])(
    'uses the same error for an unaddable target',
    async (target) => {
      users.findByEmail.mockResolvedValue(target);
      expect((await share())._unsafeUnwrapErr()).toEqual(
        NoteErrors.personNotAddable()
      );
      expect(repo.upsertPermission).not.toHaveBeenCalled();
    }
  );
  it('protects the actor from self-modification', async () => {
    repo.findPermission.mockResolvedValue(grant('editor', 'editor'));
    users.findByEmail.mockResolvedValue({ ...person, id: 'editor' });
    expect((await share('editor'))._unsafeUnwrapErr().code).toBe(
      'PERSON_NOT_ADDABLE'
    );
  });
  it.each([null, grant('viewer')])(
    'requires verification for a new or wider grant',
    async (existing) => {
      repo.findPermission.mockResolvedValue(existing);
      verified.isVerified.mockResolvedValue(false);
      expect((await share('owner', 'editor'))._unsafeUnwrapErr().code).toBe(
        'EMAIL_NOT_VERIFIED'
      );
      expect(repo.upsertPermission).not.toHaveBeenCalled();
    }
  );
  it.each(['viewer', 'editor'] as const)(
    'allows an unverified owner to narrow or retain %s',
    async (current) => {
      repo.findPermission.mockResolvedValue(grant(current));
      verified.isVerified.mockResolvedValue(false);
      expect((await share()).isOk()).toBe(true);
      expect(verified.isVerified).not.toHaveBeenCalled();
      expect(repo.upsertPermission).toHaveBeenCalledWith(
        expect.objectContaining({ allowAmplification: false })
      );
    }
  );
  it('does not emit private recipient data', async () => {
    await share();
    expect(Object.keys(events.emit.mock.calls[0][1])).toEqual([
      'actorId',
      'shareType',
      'permission',
    ]);
  });
  it('does not emit success on persistence failure', async () => {
    repo.upsertPermission.mockResolvedValue(
      err(NoteErrors.persistenceError('share', 'note'))
    );
    expect((await share()).isErr()).toBe(true);
    expect(events.emit).not.toHaveBeenCalled();
  });
  it('returns missing note before recipient lookup', async () => {
    repo.findById.mockResolvedValue(null);
    expect((await share())._unsafeUnwrapErr().code).toBe('NOTE_NOT_FOUND');
    expect(users.findByEmail).not.toHaveBeenCalled();
  });
});
