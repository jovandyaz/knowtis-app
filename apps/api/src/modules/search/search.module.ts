import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { SearchController } from './search.controller';

@Module({
  imports: [AgentModule],
  controllers: [SearchController],
})
export class SearchModule {}
