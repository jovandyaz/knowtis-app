import { Logger, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { RSS_LIMIT_BYTES, rssLimitBytes } from './container-memory-limit';
import { DbHealthIndicator } from './db-health.indicator';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    DbHealthIndicator,
    {
      provide: RSS_LIMIT_BYTES,
      useFactory: () => {
        const bytes = rssLimitBytes();
        new Logger(HealthModule.name).log(`RSS health ceiling: ${bytes} bytes`);
        return bytes;
      },
    },
  ],
})
export class HealthModule {}
