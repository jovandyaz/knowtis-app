import { join } from 'node:path';

import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { MODEL_CATALOG } from '@knowtis/ai-gateway';

import { AIController } from './ai.controller';
import { AIGateway } from './ai.gateway';
import { CompleteTextHandler } from './application/commands/complete-text.handler';
import { StreamTextHandler } from './application/commands/stream-text.handler';
import { VoiceNoteHandler } from './application/commands/voice-note.handler';
import { AICompletionPipeline } from './application/services/ai-completion-pipeline.service';
import { AIConfigService } from './application/services/ai-config.service';
import { AIMetricsService } from './application/services/ai-metrics.service';
import { AIOrchestrator } from './application/services/ai-orchestrator.service';
import { AIRateLimitService } from './application/services/ai-rate-limit.service';
import {
  PromptLoaderService,
  PROMPTS_DIR,
} from './application/services/prompt-loader.service';
import { VoiceTranscriptionService } from './application/services/voice-transcription.service';
import { AI_CACHE } from './domain/ports/ai-cache.port';
import { AI_CONFIG_REPOSITORY } from './domain/ports/ai-config.repository';
import { AI_COMPLETION_PROVIDER } from './domain/ports/ai-provider.port';
import { AI_STRUCTURED_OUTPUT_PROVIDER } from './domain/ports/ai-structured-output.port';
import { AI_USAGE_REPOSITORY } from './domain/ports/ai-usage.repository';
import { EMBEDDING_PORT } from './domain/ports/embedding.port';
import { RATE_LIMIT_PROVIDER } from './domain/ports/rate-limit.port';
import { WebhookAlertService } from './infrastructure/alerting/webhook-alert.service';
import { ModelCatalogAdapter } from './infrastructure/catalog/model-catalog.adapter';
import { VoyageEmbeddingAdapter } from './infrastructure/embedding/voyage-embedding.adapter';
import { DrizzleAIConfigRepository } from './infrastructure/persistence/drizzle-ai-config.repository';
import { DrizzleAIUsageRepository } from './infrastructure/persistence/drizzle-ai-usage.repository';
import { AISDKProvider } from './infrastructure/providers/ai-sdk.provider';
import { AIStructuredOutputSDKProvider } from './infrastructure/providers/ai-structured-output-sdk.provider';
import { FallbackChainService } from './infrastructure/providers/fallback-chain.service';
import { ProviderRegistryFactory } from './infrastructure/providers/provider-registry.factory';
import {
  AI_REDIS,
  AIRedisProvider,
} from './infrastructure/redis/ai-redis.provider';
import { ExactMatchCacheService } from './infrastructure/redis/exact-match-cache.service';
import { RedisRateLimitService } from './infrastructure/redis/redis-rate-limit.service';

@Module({
  imports: [
    CacheModule.register(),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AIController],
  providers: [
    ProviderRegistryFactory,
    WebhookAlertService,
    FallbackChainService,
    { provide: MODEL_CATALOG, useClass: ModelCatalogAdapter },
    { provide: AI_COMPLETION_PROVIDER, useClass: AISDKProvider },
    {
      provide: AI_STRUCTURED_OUTPUT_PROVIDER,
      useClass: AIStructuredOutputSDKProvider,
    },
    { provide: AI_CONFIG_REPOSITORY, useClass: DrizzleAIConfigRepository },
    { provide: AI_USAGE_REPOSITORY, useClass: DrizzleAIUsageRepository },
    { provide: EMBEDDING_PORT, useClass: VoyageEmbeddingAdapter },
    { provide: AI_REDIS, useClass: AIRedisProvider },
    { provide: RATE_LIMIT_PROVIDER, useClass: RedisRateLimitService },
    { provide: AI_CACHE, useClass: ExactMatchCacheService },
    { provide: PROMPTS_DIR, useValue: join(__dirname, 'prompts') },
    AIConfigService,
    PromptLoaderService,
    AIOrchestrator,
    AICompletionPipeline,
    AIMetricsService,
    AIRateLimitService,
    CompleteTextHandler,
    StreamTextHandler,
    VoiceNoteHandler,
    VoiceTranscriptionService,
    AIGateway,
  ],
  exports: [
    ProviderRegistryFactory,
    FallbackChainService,
    MODEL_CATALOG,
    AIConfigService,
    AIMetricsService,
    AIOrchestrator,
    AIRateLimitService,
    AI_STRUCTURED_OUTPUT_PROVIDER,
    AI_REDIS,
    EMBEDDING_PORT,
  ],
})
export class AIModule {}
