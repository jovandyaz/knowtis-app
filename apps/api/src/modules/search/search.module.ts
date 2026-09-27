import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { AIModule } from '../ai/ai.module';
import { SearchController } from './search.controller';

@Module({
  imports: [AIModule, AgentModule],
  controllers: [SearchController],
})
export class SearchModule {}
