import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  bootConfigModule,
  infrastructureStub,
} from '../../../test-support/module-boot';
import { AgentModule } from '../../agent/agent.module';
import { ApproveMutationHandler } from '../../agent/application/approve-mutation.handler';
import { AIModule } from '../../ai/ai.module';
import { ByokService } from '../../ai/application/services/byok.service';
import { AI_REDIS } from '../../ai/infrastructure/redis/ai-redis.provider';
import { McpKeysService } from '../../mcp/mcp-keys.service';
import { McpModule } from '../../mcp/mcp.module';
import { ShareNoteHandler } from '../../notes/application/commands/share-note.handler';
import { UpdateNoteHandler } from '../../notes/application/commands/update-note.handler';
import { NotesModule } from '../../notes/notes.module';
import { VerifiedIdentityPolicy } from '../verified-identity.policy';

const GATED_SITES = [
  { name: 'ShareNoteHandler', target: ShareNoteHandler, owner: NotesModule },
  { name: 'UpdateNoteHandler', target: UpdateNoteHandler, owner: NotesModule },
  { name: 'McpKeysService', target: McpKeysService, owner: McpModule },
  { name: 'ByokService', target: ByokService, owner: AIModule },
  {
    name: 'ApproveMutationHandler',
    target: ApproveMutationHandler,
    owner: AgentModule,
  },
] as const;

const COMPILE_TIMEOUT_MS = 15_000;

// Deliberately not mocked: an owner module that stopped importing UsersModule
// must fail to compile here, not receive a silent stand-in for the gate.
const mockAllButThePolicy = (token: unknown) =>
  token === VerifiedIdentityPolicy ? undefined : infrastructureStub();

describe('verified identity wiring', () => {
  it.each(GATED_SITES)(
    "$name reaches the container's own verified-identity policy",
    async ({ target, owner }) => {
      const moduleRef = await Test.createTestingModule({
        imports: [bootConfigModule(), owner],
      })
        .overrideProvider(AI_REDIS)
        .useValue(infrastructureStub())
        .useMocker(mockAllButThePolicy)
        .compile();

      try {
        const site = moduleRef.get(target);
        const policy = moduleRef.get(VerifiedIdentityPolicy);

        expect(site).toBeInstanceOf(target);
        expect(policy).toBeInstanceOf(VerifiedIdentityPolicy);
        const policyOwner =
          target === ApproveMutationHandler
            ? moduleRef.get(ShareNoteHandler)
            : site;
        if (target === ApproveMutationHandler) {
          expect(Object.values(site)).toContain(policyOwner);
        }
        expect(Object.values(policyOwner)).toContain(policy);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );
});
