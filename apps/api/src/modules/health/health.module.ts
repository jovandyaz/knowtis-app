import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DbHealthIndicator } from './db-health.indicator';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DbHealthIndicator],
})
export class HealthModule {}
