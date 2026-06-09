import { Module } from '@nestjs/common';

import { LangfuseTracingService } from './langfuse-tracing.service';

@Module({
  providers: [LangfuseTracingService],
})
export class ObservabilityModule {}
