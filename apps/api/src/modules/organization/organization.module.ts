import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { AIModule } from '../ai/ai.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { NotesModule } from '../notes/notes.module';
import { AiOrganizationController } from './ai-organization.controller';
import { SuggestOrganizationHandler } from './application/commands/suggest-organization.handler';

/**
 * Organization suggestions sit above the AI, notes and retrieval stacks
 * rather than inside `ai`: the retrieval adapters already depend on
 * `AIModule` for embeddings and rate limiting, so hosting this there would
 * invert the dependency.
 */
@Module({
  imports: [AIModule, AgentModule, NotesModule, FeatureFlagsModule],
  controllers: [AiOrganizationController],
  providers: [SuggestOrganizationHandler],
})
export class OrganizationModule {}
