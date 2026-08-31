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
import { InjectionGuardService } from './application/injection-guard.service';
import { RejectMutationHandler } from './application/reject-mutation.handler';
import { RunAgentTurnHandler } from './application/run-agent-turn.handler';
import { AGENT_ORCHESTRATOR } from './domain/ports/agent-orchestrator.port';
import { CONVERSATION_REPOSITORY } from './domain/ports/conversation.repository';
import { MEMORY_REPOSITORY } from './domain/ports/memory.repository';
import { NOTE_EMBEDDING_REPOSITORY } from './domain/ports/note-embedding.repository';
import { PENDING_MUTATION_STORE } from './domain/ports/pending-mutation.store';
import { RETRIEVAL_PORT } from './domain/ports/retrieval.port';
import { AgentHealthReportTask } from './infrastructure/health/agent-health-report.task';
import { AgentHealthQueries } from './infrastructure/health/agent-health.queries';
import { MemoryExtractionTask } from './infrastructure/memory/memory-extraction.task';
import { AgentToolRegistry } from './infrastructure/orchestrator/agent-tool.registry';
import { AiSdkAgentOrchestrator } from './infrastructure/orchestrator/ai-sdk-agent.orchestrator';
import { MutationProposalBuilder } from './infrastructure/orchestrator/mutation-proposal.builder';
import { RedisPendingMutationStore } from './infrastructure/pending/redis-pending-mutation.store';
import { DrizzleConversationRepository } from './infrastructure/persistence/drizzle-conversation.repository';
import { DrizzleMemoryRepository } from './infrastructure/persistence/drizzle-memory.repository';
import { DrizzleNoteEmbeddingRepository } from './infrastructure/retrieval/drizzle-note-embedding.repository';
import { EmbeddingReconcileTask } from './infrastructure/retrieval/embedding-reconcile.task';
import { FeatureFlaggedRetrievalAdapter } from './infrastructure/retrieval/feature-flagged-retrieval.adapter';
import { HybridRetrievalAdapter } from './infrastructure/retrieval/hybrid-retrieval.adapter';
import { KeywordRetrievalAdapter } from './infrastructure/retrieval/keyword-retrieval.adapter';
import {
  AGENT_TOOL_GROUPS,
  type AgentToolGroup,
} from './infrastructure/tools/agent-tool';
import { NoteMutateToolGroup } from './infrastructure/tools/note-mutate.tool-group';
import { NoteReadToolGroup } from './infrastructure/tools/note-read.tool-group';
import { WebToolGroup } from './infrastructure/tools/web.tool-group';
import { MemoryController } from './memory.controller';

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
  controllers: [MemoryController],
  providers: [
    KeywordRetrievalAdapter,
    HybridRetrievalAdapter,
    { provide: RETRIEVAL_PORT, useClass: FeatureFlaggedRetrievalAdapter },
    { provide: AGENT_ORCHESTRATOR, useClass: AiSdkAgentOrchestrator },
    { provide: PENDING_MUTATION_STORE, useClass: RedisPendingMutationStore },
    {
      provide: NOTE_EMBEDDING_REPOSITORY,
      useClass: DrizzleNoteEmbeddingRepository,
    },
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: DrizzleConversationRepository,
    },
    { provide: MEMORY_REPOSITORY, useClass: DrizzleMemoryRepository },
    EmbeddingReconcileTask,
    MemoryExtractionTask,
    AgentHealthQueries,
    AgentHealthReportTask,
    InjectionGuardService,
    NoteReadToolGroup,
    NoteMutateToolGroup,
    WebToolGroup,
    {
      provide: AGENT_TOOL_GROUPS,
      useFactory: (...groups: AgentToolGroup[]): AgentToolGroup[] => groups,
      inject: [NoteReadToolGroup, NoteMutateToolGroup, WebToolGroup],
    },
    AgentToolRegistry,
    MutationProposalBuilder,
    ApproveMutationHandler,
    RejectMutationHandler,
    RunAgentTurnHandler,
    AgentGateway,
  ],
  exports: [RETRIEVAL_PORT],
})
export class AgentModule {}
