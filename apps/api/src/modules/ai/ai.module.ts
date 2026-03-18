import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AIController } from './ai.controller';
import { AIGateway } from './ai.gateway';
import { CompleteTextHandler } from './application/commands/complete-text.handler';
import { StreamTextHandler } from './application/commands/stream-text.handler';
import { VoiceNoteHandler } from './application/commands/voice-note.handler';
import { AIMetricsService } from './application/services/ai-metrics.service';
import { AIOrchestrator } from './application/services/ai-orchestrator.service';
import { AIRateLimitService } from './application/services/ai-rate-limit.service';
import { VoiceTranscriptionService } from './application/services/voice-transcription.service';
import { AI_CACHE } from './domain/ports/ai-cache.port';
import { AI_COMPLETION_PROVIDER } from './domain/ports/ai-provider.port';
import { AI_STRUCTURED_OUTPUT_PROVIDER } from './domain/ports/ai-structured-output.port';
import { AI_USAGE_REPOSITORY } from './domain/ports/ai-usage.repository';
import { RATE_LIMIT_PROVIDER } from './domain/ports/rate-limit.port';
import { DrizzleAIUsageRepository } from './infrastructure/persistence/drizzle-ai-usage.repository';
import { AISDKProvider } from './infrastructure/providers/ai-sdk.provider';
import { AIStructuredOutputSDKProvider } from './infrastructure/providers/ai-structured-output-sdk.provider';
import {
  AI_REDIS,
  AIRedisProvider,
} from './infrastructure/redis/ai-redis.provider';
import { RedisRateLimitService } from './infrastructure/redis/redis-rate-limit.service';
import { SemanticCacheService } from './infrastructure/redis/semantic-cache.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AIController],
  providers: [
    { provide: AI_COMPLETION_PROVIDER, useClass: AISDKProvider },
    {
      provide: AI_STRUCTURED_OUTPUT_PROVIDER,
      useClass: AIStructuredOutputSDKProvider,
    },
    { provide: AI_USAGE_REPOSITORY, useClass: DrizzleAIUsageRepository },
    { provide: AI_REDIS, useClass: AIRedisProvider },
    { provide: RATE_LIMIT_PROVIDER, useClass: RedisRateLimitService },
    { provide: AI_CACHE, useClass: SemanticCacheService },
    AIOrchestrator,
    AIMetricsService,
    AIRateLimitService,
    CompleteTextHandler,
    StreamTextHandler,
    VoiceNoteHandler,
    VoiceTranscriptionService,
    AIGateway,
  ],
  exports: [
    AIMetricsService,
    AIOrchestrator,
    AIRateLimitService,
    AI_STRUCTURED_OUTPUT_PROVIDER,
  ],
})
export class AIModule {}
