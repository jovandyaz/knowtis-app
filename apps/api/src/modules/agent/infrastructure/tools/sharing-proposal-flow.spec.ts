import { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import {
  IDENTITY_STATE,
  policyFor,
  type IdentityState,
} from '../../../../test-support/verified-identity';
import { AppAbilityFactory } from '../../../authorization/ability.factory';
import { ShareNoteHandler } from '../../../notes/application/commands/share-note.handler';
import type { NoteRepository } from '../../../notes/domain/ports';
import { PermissionLevel } from '../../../notes/domain/value-objects/permission-level.vo';
import type { UserReadRepository } from '../../../users/domain/ports/user-read.repository';
import { ApproveMutationHandler } from '../../application/approve-mutation.handler';
import type { PendingMutationRecord } from '../../domain/ports/pending-mutation.store';
import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import { MutationProposalBuilder } from '../orchestrator/mutation-proposal.builder';
import { ProposalCollector } from '../orchestrator/proposal-collector';
import { WebFetchAllowlist } from '../orchestrator/web-fetch-allowlist';
import { WebSourceCollector } from '../orchestrator/web-source.collector';
import { NoteMutateToolGroup } from './note-mutate.tool-group';

type Level = 'viewer' | 'editor';
const grant = (permission: Level) => ({
  permission: PermissionLevel.create(permission)._unsafeUnwrap(),
});

function flow(
  current: Level | null,
  identity: IdentityState = IDENTITY_STATE.UNVERIFIED
) {
  const policy = policyFor(identity);
  const repo = {
    findById: vi.fn().mockResolvedValue({
      id: 'note-1',
      ownerId: 'u1',
      title: 'Plan',
      editorsCanShare: true,
    }),
    findPermission: vi.fn().mockResolvedValue(current ? grant(current) : null),
    upsertPermission: vi
      .fn()
      .mockImplementation(async (input) => ok(grant(input.permission))),
  };
  const users = {
    findByEmail: vi.fn().mockResolvedValue({
      id: 'recipient',
      name: 'Recipient',
      email: 'recipient@example.test',
      avatarUrl: null,
      isAnonymous: false,
    }),
  };
  const retrieval = {
    getById: vi.fn().mockResolvedValue({
      id: 'note-1',
      title: 'Plan',
      updatedAt: '2026-09-07T00:00:00.000Z',
    }),
  };
  const proposals = new ProposalCollector();
  const tool = new NoteMutateToolGroup(
    new MutationProposalBuilder(retrieval as unknown as RetrievalPort)
  ).build({
    userId: 'u1',
    phase: 'full',
    byokTurn: false,
    proposals,
    webSources: new WebSourceCollector(),
    webFetchAllowlist: new WebFetchAllowlist(),
  }).proposeShareNote as {
    execute: (input: unknown, options: unknown) => Promise<unknown>;
  };
  let pending: PendingMutationRecord | null = null;
  const store = {
    save: async (record: PendingMutationRecord) => {
      pending = record;
    },
    take: async (id: string, userId: string) => {
      if (pending?.mutation.id !== id || pending.userId !== userId) {
        return null;
      }
      const record = pending;
      pending = null;
      return record;
    },
  };
  const approval = new ApproveMutationHandler(
    store,
    { execute: vi.fn() } as never,
    { execute: vi.fn() } as never,
    new ShareNoteHandler(
      repo as unknown as NoteRepository,
      policy,
      new EventEmitter2(),
      users as unknown as UserReadRepository
    ),
    new AppAbilityFactory(),
    repo as unknown as NoteRepository
  );
  return {
    repo,
    users,
    retrieval,
    approval,
    tool,
    proposals,
    async propose(permission: Level) {
      const result = await tool.execute(
        {
          noteId: 'note-1',
          targetEmail: 'recipient@example.test',
          permission,
        },
        {}
      );
      expect(result).toMatchObject({ ok: true });
      expect(repo.upsertPermission).not.toHaveBeenCalled();
      expect(users.findByEmail).not.toHaveBeenCalled();
      expect(retrieval.getById).toHaveBeenCalledWith('u1', 'note-1');
      const mutation = proposals.captured;
      if (!mutation) {
        throw new Error('Expected a proposal awaiting confirmation');
      }
      await store.save({
        userId: 'u1',
        mutation,
        toolName: 'proposeShareNote',
      });
      return mutation.id;
    },
  };
}

describe('Copilot sharing proposal to canonical execution', () => {
  it.each(['viewer', 'editor'] as const)(
    'lets an unverified owner propose and confirm narrowing/retaining %s, once',
    async (current) => {
      const f = flow(current);
      const proposalId = await f.propose('viewer');
      expect(
        (
          await f.approval.execute({ proposalId, userId: 'other' })
        )._unsafeUnwrapErr().code
      ).toBe('AGENT_PROPOSAL_EXPIRED');
      expect(f.repo.upsertPermission).not.toHaveBeenCalled();
      expect(
        (await f.approval.execute({ proposalId, userId: 'u1' })).isOk()
      ).toBe(true);
      expect(f.repo.upsertPermission).toHaveBeenCalledWith(
        expect.objectContaining({ allowAmplification: false })
      );
      expect(
        (
          await f.approval.execute({ proposalId, userId: 'u1' })
        )._unsafeUnwrapErr().code
      ).toBe('AGENT_PROPOSAL_EXPIRED');
      expect(f.repo.upsertPermission).toHaveBeenCalledTimes(1);
    }
  );

  it.each([null, 'viewer'] as const)(
    'blocks unverified new/editor-upgrade execution from %s after confirmation',
    async (current) => {
      const f = flow(current);
      const proposalId = await f.propose('editor');
      expect(
        (
          await f.approval.execute({ proposalId, userId: 'u1' })
        )._unsafeUnwrapErr().code
      ).toBe('AGENT_EMAIL_NOT_VERIFIED');
      expect(f.repo.upsertPermission).not.toHaveBeenCalled();
    }
  );

  it('preserves gate-off sharing through the real identity policy', async () => {
    const f = flow(null, IDENTITY_STATE.GATE_OFF);
    const proposalId = await f.propose('viewer');
    expect(
      (await f.approval.execute({ proposalId, userId: 'u1' })).isOk()
    ).toBe(true);
    expect(f.repo.upsertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ allowAmplification: true })
    );
  });

  it('rechecks note management authorization at confirmation', async () => {
    const f = flow('editor');
    const proposalId = await f.propose('viewer');
    f.repo.findById.mockResolvedValue({
      id: 'note-1',
      ownerId: 'other',
      title: 'Plan',
      editorsCanShare: false,
    });
    expect(
      (
        await f.approval.execute({ proposalId, userId: 'u1' })
      )._unsafeUnwrapErr().code
    ).toBe('AGENT_PERMISSION_DENIED');
    expect(f.users.findByEmail).not.toHaveBeenCalled();
    expect(f.repo.upsertPermission).not.toHaveBeenCalled();
  });

  it('preserves the proposal builder note visibility check', async () => {
    const f = flow('editor');
    f.retrieval.getById.mockResolvedValue(null);
    expect(
      await f.tool.execute(
        {
          noteId: 'note-1',
          targetEmail: 'recipient@example.test',
          permission: 'viewer',
        },
        {}
      )
    ).toEqual({ error: 'Note note-1 not found or not accessible' });
    expect(f.proposals.captured).toBeNull();
    expect(f.repo.upsertPermission).not.toHaveBeenCalled();
  });
});
