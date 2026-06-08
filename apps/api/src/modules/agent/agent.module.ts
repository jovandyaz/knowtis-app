import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AIModule } from '../ai/ai.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { NotesModule } from '../notes/notes.module';
import { AgentGateway } from './agent.gateway';
import { RunAgentTurnHandler } from './application/run-agent-turn.handler';
import { AGENT_ORCHESTRATOR } from './domain/ports/agent-orchestrator.port';
import { RETRIEVAL_PORT } from './domain/ports/retrieval.port';
import { AgentToolsFactory } from './infrastructure/orchestrator/agent-tools.factory';
import { AiSdkAgentOrchestrator } from './infrastructure/orchestrator/ai-sdk-agent.orchestrator';
import { KeywordRetrievalAdapter } from './infrastructure/retrieval/keyword-retrieval.adapter';

@Module({
  imports: [
    AIModule,
    NotesModule,
    FeatureFlagsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    { provide: RETRIEVAL_PORT, useClass: KeywordRetrievalAdapter },
    { provide: AGENT_ORCHESTRATOR, useClass: AiSdkAgentOrchestrator },
    AgentToolsFactory,
    RunAgentTurnHandler,
    AgentGateway,
  ],
})
export class AgentModule {}
