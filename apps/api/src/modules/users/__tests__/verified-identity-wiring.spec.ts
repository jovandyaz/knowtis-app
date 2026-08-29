import 'reflect-metadata';

import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { validateEnv } from '../../../config/env.config';
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

// Run through the real schema so every constructor that parses a setting at
// build time gets the shipped default rather than undefined.
const BOOT_ENV = validateEnv({
  DATABASE_URL: 'postgres://localhost:5432/knowtis_test',
  JWT_SECRET: 'a'.repeat(40) + '-access-secret-x',
  JWT_REFRESH_SECRET: 'b'.repeat(40) + '-refresh-secret-x',
  TOKEN_HASH_KEY: 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=',
});

// Answers any call with undefined, which is all the infrastructure (database,
// Redis, mail) has to do while the graph is constructed. `then` must stay
// absent: Nest awaits each instance, and a callable `then` never settles.
const infrastructureStub = () =>
  new Proxy(
    {},
    {
      get: (_target, property) =>
        property === 'then' || typeof property === 'symbol'
          ? undefined
          : vi.fn(),
    }
  );

// Deliberately not mocked: an owner module that stopped importing UsersModule
// must fail to compile here, not receive a silent stand-in for the gate.
const mockAllButThePolicy = (token: unknown) =>
  token === VerifiedIdentityPolicy ? undefined : infrastructureStub();

describe('verified identity wiring', () => {
  it.each(GATED_SITES)(
    "$name is built by Nest with the container's own policy instance",
    async ({ target, owner }) => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => BOOT_ENV],
          }),
          owner,
        ],
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
        expect(Object.values(site)).toContain(policy);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );
});
