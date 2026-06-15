import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AIModule } from '../ai/ai.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { NotesModule } from '../notes/notes.module';
import { UsersModule } from '../users/users.module';
import { AgentGateway } from './agent.gateway';
import { ApproveMutationHandler } from './application/approve-mutation.handler';
import { RejectMutationHandler } from './application/reject-mutation.handler';
import { RunAgentTurnHandler } from './application/run-agent-turn.handler';
import { AGENT_ORCHESTRATOR } from './domain/ports/agent-orchestrator.port';
import { NOTE_EMBEDDING_REPOSITORY } from './domain/ports/note-embedding.repository';
import { PENDING_MUTATION_STORE } from './domain/ports/pending-mutation.store';
import { RETRIEVAL_PORT } from './domain/ports/retrieval.port';
import { AgentToolsFactory } from './infrastructure/orchestrator/agent-tools.factory';
import { AiSdkAgentOrchestrator } from './infrastructure/orchestrator/ai-sdk-agent.orchestrator';
import { MutationProposalBuilder } from './infrastructure/orchestrator/mutation-proposal.builder';
import { RedisPendingMutationStore } from './infrastructure/pending/redis-pending-mutation.store';
import { DrizzleNoteEmbeddingRepository } from './infrastructure/retrieval/drizzle-note-embedding.repository';
import { EmbeddingReconcileTask } from './infrastructure/retrieval/embedding-reconcile.task';
import { KeywordRetrievalAdapter } from './infrastructure/retrieval/keyword-retrieval.adapter';

@Module({
  imports: [
    AIModule,
    NotesModule,
    UsersModule,
    AuthorizationModule,
    FeatureFlagsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [
    { provide: RETRIEVAL_PORT, useClass: KeywordRetrievalAdapter },
    { provide: AGENT_ORCHESTRATOR, useClass: AiSdkAgentOrchestrator },
    { provide: PENDING_MUTATION_STORE, useClass: RedisPendingMutationStore },
    {
      provide: NOTE_EMBEDDING_REPOSITORY,
      useClass: DrizzleNoteEmbeddingRepository,
    },
    EmbeddingReconcileTask,
    AgentToolsFactory,
    MutationProposalBuilder,
    ApproveMutationHandler,
    RejectMutationHandler,
    RunAgentTurnHandler,
    AgentGateway,
  ],
})
export class AgentModule {}
