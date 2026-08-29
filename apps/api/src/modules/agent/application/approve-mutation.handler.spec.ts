import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import {
  IDENTITY_STATE,
  policyFor,
  type IdentityState,
} from '../../../test-support/verified-identity';
import { AppAbilityFactory } from '../../authorization/ability.factory';
import { NoteErrors } from '../../notes/domain/errors/note.errors';
import { ProposedMutation } from '../domain/proposed-mutation';
import { ApproveMutationHandler } from './approve-mutation.handler';

function createProposal() {
  const r = ProposedMutation.create({
    id: 'p1',
    kind: 'create',
    payload: { title: 'GTD', contentHtml: '<p>x</p>' },
    summary: 's',
  });
  if (r.isErr()) {
    throw new Error('setup');
  }
  return r.value;
}

function updateProposal(baseVersion?: string) {
  const r = ProposedMutation.create({
    id: 'p2',
    kind: 'update',
    targetNoteId: 'note-1',
    payload: { title: 'New' },
    summary: 's',
    ...(baseVersion ? { baseVersion } : {}),
  });
  if (r.isErr()) {
    throw new Error('setup');
  }
  return r.value;
}

function shareProposal() {
  const r = ProposedMutation.create({
    id: 'p3',
    kind: 'share',
    targetNoteId: 'note-1',
    payload: { targetEmail: 'bob@example.com', permission: 'viewer' },
    summary: 's',
  });
  if (r.isErr()) {
    throw new Error('setup');
  }
  return r.value;
}

function deps(over: Record<string, unknown> = {}) {
  return {
    store: {
      take: vi.fn().mockResolvedValue({
        userId: 'u1',
        toolName: 'proposeCreateNote',
        mutation: createProposal(),
      }),
      save: vi.fn(),
    },
    createHandler: {
      execute: vi.fn().mockResolvedValue(
        ok({
          id: 'n1',
          title: 'GTD',
          ownerId: 'u1',
          generalAccess: 'restricted',
        })
      ),
    },
    updateHandler: { execute: vi.fn() },
    shareHandler: { execute: vi.fn() },
    abilityFactory: new AppAbilityFactory(),
    noteRepo: { findById: vi.fn() },
    userRepo: { findByEmail: vi.fn() },
    identity: IDENTITY_STATE.VERIFIED as IdentityState,
    ...over,
  };
}

function make(d: ReturnType<typeof deps>) {
  return new ApproveMutationHandler(
    d.store as never,
    d.createHandler as never,
    d.updateHandler as never,
    d.shareHandler as never,
    d.abilityFactory as never,
    d.noteRepo as never,
    d.userRepo as never,
    policyFor(d.identity)
  );
}

describe('ApproveMutationHandler', () => {
  it('commits a create proposal and returns the result', async () => {
    const d = deps();
    const r = await make(d).execute({ proposalId: 'p1', userId: 'u1' });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.result).toEqual({
        noteId: 'n1',
        title: 'GTD',
        kind: 'create',
      });
    }
    expect(d.createHandler.execute).toHaveBeenCalledWith({
      title: 'GTD',
      content: '<p>x</p>',
      ownerId: 'u1',
    });
  });

  it('fails when the proposal is missing/expired', async () => {
    const d = deps({
      store: { take: vi.fn().mockResolvedValue(null), save: vi.fn() },
    });
    const r = await make(d).execute({ proposalId: 'gone', userId: 'u1' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_PROPOSAL_EXPIRED');
    }
  });

  it('fails when the user lacks permission', async () => {
    const d = deps({
      abilityFactory: {
        createAbility: () => ({ can: () => false, cannot: () => true }),
      },
    });
    const r = await make(d).execute({ proposalId: 'p1', userId: 'u1' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_PERMISSION_DENIED');
    }
  });

  it('rejects an update when the note changed since the proposal (stale)', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeUpdateNote',
          mutation: updateProposal('2024-02-01T00:00:00.000Z'),
        }),
        save: vi.fn(),
      },
      noteRepo: {
        findById: vi.fn().mockResolvedValue({
          id: 'note-1',
          title: 'X',
          ownerId: 'u1',
          generalAccess: 'restricted',
          updatedAt: new Date('2024-03-01'),
        }),
      },
    });
    const r = await make(d).execute({ proposalId: 'p2', userId: 'u1' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_STALE_NOTE');
    }
    expect(d.updateHandler.execute).not.toHaveBeenCalled();
  });

  it('commits an update proposal via the update handler', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeUpdateNote',
          mutation: updateProposal(),
        }),
        save: vi.fn(),
      },
      noteRepo: {
        findById: vi.fn().mockResolvedValue({
          id: 'note-1',
          title: 'Old',
          ownerId: 'u1',
          generalAccess: 'restricted',
          updatedAt: new Date('2024-03-01'),
        }),
      },
      updateHandler: {
        execute: vi.fn().mockResolvedValue(ok({ id: 'note-1', title: 'New' })),
      },
    });
    const r = await make(d).execute({ proposalId: 'p2', userId: 'u1' });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.result).toEqual({
        noteId: 'note-1',
        title: 'New',
        kind: 'update',
      });
    }
    expect(d.updateHandler.execute).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: 'note-1', userId: 'u1', title: 'New' })
    );
  });

  it('maps an update handler authz error to permissionDenied', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeUpdateNote',
          mutation: updateProposal(),
        }),
        save: vi.fn(),
      },
      noteRepo: {
        findById: vi.fn().mockResolvedValue({
          id: 'note-1',
          title: 'Old',
          ownerId: 'owner',
          generalAccess: 'restricted',
          updatedAt: new Date('2024-03-01'),
        }),
      },
      updateHandler: {
        execute: vi
          .fn()
          .mockResolvedValue(
            err({ code: 'PERMISSION_DENIED', message: 'denied' })
          ),
      },
    });
    const r = await make(d).execute({ proposalId: 'p2', userId: 'u1' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_PERMISSION_DENIED');
    }
  });

  it('surfaces a non-permission downstream error as AGENT_COMMIT_FAILED on update', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeUpdateNote',
          mutation: updateProposal(),
        }),
        save: vi.fn(),
      },
      noteRepo: {
        findById: vi.fn().mockResolvedValue({
          id: 'note-1',
          title: 'Old',
          ownerId: 'u1',
          generalAccess: 'restricted',
          updatedAt: new Date('2024-03-01'),
        }),
      },
      updateHandler: {
        execute: vi
          .fn()
          .mockResolvedValue(
            err({ code: 'NOTE_NOT_FOUND', message: 'note vanished' })
          ),
      },
    });
    const r = await make(d).execute({ proposalId: 'p2', userId: 'u1' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_COMMIT_FAILED');
      expect(r.error.code).not.toBe('AGENT_PERMISSION_DENIED');
      expect(r.error.message).toContain('note vanished');
    }
  });

  it('surfaces an invalid-title create error as AGENT_COMMIT_FAILED', async () => {
    const d = deps({
      createHandler: {
        execute: vi
          .fn()
          .mockResolvedValue(
            err({ code: 'INVALID_TITLE', message: 'title too long' })
          ),
      },
    });
    const r = await make(d).execute({ proposalId: 'p1', userId: 'u1' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_COMMIT_FAILED');
      expect(r.error.message).toContain('title too long');
    }
  });

  it('surfaces a non-permission share error as AGENT_COMMIT_FAILED', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeShareNote',
          mutation: shareProposal(),
        }),
        save: vi.fn(),
      },
      noteRepo: {
        findById: vi.fn().mockResolvedValue({
          id: 'note-1',
          title: 'Shared',
          ownerId: 'u1',
          generalAccess: 'restricted',
          updatedAt: new Date('2024-03-01'),
        }),
      },
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue({ id: 'target' }),
      },
      shareHandler: {
        execute: vi
          .fn()
          .mockResolvedValue(
            err({ code: 'INVALID_PERMISSION', message: 'bad permission' })
          ),
      },
    });
    const r = await make(d).execute({ proposalId: 'p3', userId: 'u1' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_COMMIT_FAILED');
    }
  });

  it('gates an unverified sharer before it can probe whether an address exists', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeShareNote',
          mutation: shareProposal(),
        }),
        save: vi.fn(),
      },
      noteRepo: { findById: vi.fn() },
      userRepo: { findByEmail: vi.fn().mockResolvedValue(null) },
      shareHandler: { execute: vi.fn() },
      identity: IDENTITY_STATE.UNVERIFIED,
    });

    const r = await make(d).execute({ proposalId: 'p3', userId: 'u1' });

    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_EMAIL_NOT_VERIFIED');
    }
    expect(d.userRepo.findByEmail).not.toHaveBeenCalled();
    expect(d.noteRepo.findById).not.toHaveBeenCalled();
    expect(d.shareHandler.execute).not.toHaveBeenCalled();
  });

  it('lets an unverified sharer through while the gate flag is off', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeShareNote',
          mutation: shareProposal(),
        }),
        save: vi.fn(),
      },
      noteRepo: {
        findById: vi.fn().mockResolvedValue({
          id: 'note-1',
          title: 'Shared',
          ownerId: 'u1',
          generalAccess: 'restricted',
          updatedAt: new Date('2024-03-01'),
        }),
      },
      userRepo: { findByEmail: vi.fn().mockResolvedValue({ id: 'target' }) },
      shareHandler: { execute: vi.fn().mockResolvedValue(ok({})) },
      identity: IDENTITY_STATE.GATE_OFF,
    });

    const r = await make(d).execute({ proposalId: 'p3', userId: 'u1' });

    expect(r.isOk()).toBe(true);
    expect(d.shareHandler.execute).toHaveBeenCalled();
  });

  it('surfaces an unverified sharer as AGENT_EMAIL_NOT_VERIFIED', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeShareNote',
          mutation: shareProposal(),
        }),
        save: vi.fn(),
      },
      noteRepo: {
        findById: vi.fn().mockResolvedValue({
          id: 'note-1',
          title: 'Shared',
          ownerId: 'u1',
          generalAccess: 'restricted',
          updatedAt: new Date('2024-03-01'),
        }),
      },
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue({ id: 'target' }),
      },
      shareHandler: {
        execute: vi
          .fn()
          .mockResolvedValue(err(NoteErrors.verificationRequired())),
      },
    });
    const r = await make(d).execute({ proposalId: 'p3', userId: 'u1' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_EMAIL_NOT_VERIFIED');
    }
  });

  it('commits a share proposal to the resolved target user', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeShareNote',
          mutation: shareProposal(),
        }),
        save: vi.fn(),
      },
      noteRepo: {
        findById: vi.fn().mockResolvedValue({
          id: 'note-1',
          title: 'Shared',
          ownerId: 'u1',
          generalAccess: 'restricted',
          updatedAt: new Date('2024-03-01'),
        }),
      },
      userRepo: {
        findByEmail: vi.fn().mockResolvedValue({ id: 'target' }),
      },
      shareHandler: {
        execute: vi.fn().mockResolvedValue(ok({ id: 'perm-1' })),
      },
    });
    const r = await make(d).execute({ proposalId: 'p3', userId: 'u1' });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.result.kind).toBe('share');
    }
    expect(d.shareHandler.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: 'note-1',
        userId: 'u1',
        targetUserId: 'target',
        permission: 'viewer',
      })
    );
  });

  it('fails a share when the target email has no user', async () => {
    const d = deps({
      store: {
        take: vi.fn().mockResolvedValue({
          userId: 'u1',
          toolName: 'proposeShareNote',
          mutation: shareProposal(),
        }),
        save: vi.fn(),
      },
      noteRepo: {
        findById: vi.fn().mockResolvedValue({
          id: 'note-1',
          title: 'Shared',
          ownerId: 'u1',
          generalAccess: 'restricted',
          updatedAt: new Date('2024-03-01'),
        }),
      },
      userRepo: { findByEmail: vi.fn().mockResolvedValue(null) },
    });
    const r = await make(d).execute({ proposalId: 'p3', userId: 'u1' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('AGENT_TARGET_USER_NOT_FOUND');
    }
  });
});
