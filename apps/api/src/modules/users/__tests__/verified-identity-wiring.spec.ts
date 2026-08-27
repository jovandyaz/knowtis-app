import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { AgentModule } from '../../agent/agent.module';
import { ApproveMutationHandler } from '../../agent/application/approve-mutation.handler';
import { AIModule } from '../../ai/ai.module';
import { ByokService } from '../../ai/application/services/byok.service';
import { McpKeysService } from '../../mcp/mcp-keys.service';
import { McpModule } from '../../mcp/mcp.module';
import { ShareNoteHandler } from '../../notes/application/commands/share-note.handler';
import { UpdateNoteHandler } from '../../notes/application/commands/update-note.handler';
import { NotesModule } from '../../notes/notes.module';
import { UsersModule } from '../users.module';
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

// `toContain` on an undefined subject passes in this vitest version, so every
// metadata read is defaulted to [] before it is asserted.
const metadataList = (key: string, target: object): unknown[] =>
  (Reflect.getMetadata(key, target) as unknown[] | undefined) ?? [];

describe('verified identity wiring', () => {
  it.each(GATED_SITES)(
    '$name keeps the policy in its design-time metadata',
    ({ target }) => {
      expect(metadataList('design:paramtypes', target)).toContain(
        VerifiedIdentityPolicy
      );
    }
  );

  it.each(GATED_SITES)('$name can resolve it from its module', ({ owner }) => {
    expect(metadataList('imports', owner)).toContain(UsersModule);
  });

  it('exports the policy from UsersModule', () => {
    expect(metadataList('exports', UsersModule)).toContain(
      VerifiedIdentityPolicy
    );
  });
});
