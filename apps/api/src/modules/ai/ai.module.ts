import { join } from 'node:path';

import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { MODEL_CATALOG } from '@knowtis/ai-gateway';

import { AdminAuditModule } from '../admin/audit/admin-audit.module';
import { AiKeysController } from './ai-keys.controller';
import { AiModelsController } from './ai-models.controller';
import { AiProvidersController } from './ai-providers.controller';
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
import { ByokService } from './application/services/byok.service';
import { InjectionClassifierService } from './application/services/injection-classifier.service';
import { ModelPreferenceService } from './application/services/model-preference.service';
import {
  PromptLoaderService,
  PROMPTS_DIR,
} from './application/services/prompt-loader.service';
import { SelectableModelsService } from './application/services/selectable-models.service';
import { SystemProviderKeysService } from './application/services/system-provider-keys.service';
import { VoiceTranscriptionService } from './application/services/voice-transcription.service';
import { AI_CACHE } from './domain/ports/ai-cache.port';
import { AI_CATALOG_REPOSITORY } from './domain/ports/ai-catalog.repository';
import { AI_CONFIG_REPOSITORY } from './domain/ports/ai-config.repository';
import { AI_COMPLETION_PROVIDER } from './domain/ports/ai-provider.port';
import { AI_STRUCTURED_OUTPUT_PROVIDER } from './domain/ports/ai-structured-output.port';
import { AI_USAGE_REPOSITORY } from './domain/ports/ai-usage.repository';
import { EMBEDDING_PORT } from './domain/ports/embedding.port';
import { RATE_LIMIT_PROVIDER } from './domain/ports/rate-limit.port';
import { SYSTEM_PROVIDER_KEYS_REPOSITORY } from './domain/ports/system-provider-keys.repository';
import { USER_AI_SETTINGS_REPOSITORY } from './domain/ports/user-ai-settings.repository';
import { USER_PROVIDER_KEYS_REPOSITORY } from './domain/ports/user-provider-keys.repository';
import { WEB_SEARCH_PORT } from './domain/ports/web-search.port';
import { WebhookAlertService } from './infrastructure/alerting/webhook-alert.service';
import { CompositeModelCatalog } from './infrastructure/catalog/composite-model-catalog';
import { ModelCatalogAdapter } from './infrastructure/catalog/model-catalog.adapter';
import { PromotedModelsCache } from './infrastructure/catalog/promoted-models.cache';
import { VoyageEmbeddingAdapter } from './infrastructure/embedding/voyage-embedding.adapter';
import { DrizzleAiCatalogRepository } from './infrastructure/persistence/drizzle-ai-catalog.repository';
import { DrizzleAIConfigRepository } from './infrastructure/persistence/drizzle-ai-config.repository';
import { DrizzleAIUsageRepository } from './infrastructure/persistence/drizzle-ai-usage.repository';
import { DrizzleSystemProviderKeysRepository } from './infrastructure/persistence/drizzle-system-provider-keys.repository';
import { DrizzleUserAiSettingsRepository } from './infrastructure/persistence/drizzle-user-ai-settings.repository';
import { DrizzleUserProviderKeysRepository } from './infrastructure/persistence/drizzle-user-provider-keys.repository';
import { AISDKProvider } from './infrastructure/providers/ai-sdk.provider';
import { AIStructuredOutputSDKProvider } from './infrastructure/providers/ai-structured-output-sdk.provider';
import {
  FALLBACK_CHAIN_SOURCE,
  FallbackChainService,
} from './infrastructure/providers/fallback-chain.service';
import {
  ProviderRegistryFactory,
  SYSTEM_PROVIDER_KEYS_SOURCE,
} from './infrastructure/providers/provider-registry.factory';
import {
  AI_REDIS,
  AIRedisProvider,
} from './infrastructure/redis/ai-redis.provider';
import { ExactMatchCacheService } from './infrastructure/redis/exact-match-cache.service';
import { RedisRateLimitService } from './infrastructure/redis/redis-rate-limit.service';
import { TavilyWebSearchAdapter } from './infrastructure/web-search/tavily-web-search.adapter';

@Module({
  imports: [
    AdminAuditModule,
    CacheModule.register(),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow('JWT_SECRET'),
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [
    AIController,
    AiModelsController,
    AiKeysController,
    AiProvidersController,
  ],
  providers: [
    SelectableModelsService,
    ModelPreferenceService,
    {
      provide: USER_AI_SETTINGS_REPOSITORY,
      useClass: DrizzleUserAiSettingsRepository,
    },
    ByokService,
    {
      provide: USER_PROVIDER_KEYS_REPOSITORY,
      useClass: DrizzleUserProviderKeysRepository,
    },
    ProviderRegistryFactory,
    WebhookAlertService,
    FallbackChainService,
    { provide: FALLBACK_CHAIN_SOURCE, useExisting: AIConfigService },
    SystemProviderKeysService,
    {
      provide: SYSTEM_PROVIDER_KEYS_REPOSITORY,
      useClass: DrizzleSystemProviderKeysRepository,
    },
    {
      provide: SYSTEM_PROVIDER_KEYS_SOURCE,
      useExisting: SystemProviderKeysService,
    },
    ModelCatalogAdapter,
    PromotedModelsCache,
    { provide: MODEL_CATALOG, useClass: CompositeModelCatalog },
    { provide: AI_COMPLETION_PROVIDER, useClass: AISDKProvider },
    {
      provide: AI_STRUCTURED_OUTPUT_PROVIDER,
      useClass: AIStructuredOutputSDKProvider,
    },
    { provide: AI_CATALOG_REPOSITORY, useClass: DrizzleAiCatalogRepository },
    { provide: AI_CONFIG_REPOSITORY, useClass: DrizzleAIConfigRepository },
    { provide: AI_USAGE_REPOSITORY, useClass: DrizzleAIUsageRepository },
    { provide: EMBEDDING_PORT, useClass: VoyageEmbeddingAdapter },
    { provide: WEB_SEARCH_PORT, useClass: TavilyWebSearchAdapter },
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
    InjectionClassifierService,
    CompleteTextHandler,
    StreamTextHandler,
    VoiceNoteHandler,
    VoiceTranscriptionService,
    AIGateway,
  ],
  exports: [
    ByokService,
    ProviderRegistryFactory,
    FallbackChainService,
    MODEL_CATALOG,
    AIConfigService,
    ModelPreferenceService,
    AIMetricsService,
    AIOrchestrator,
    AIRateLimitService,
    InjectionClassifierService,
    AI_STRUCTURED_OUTPUT_PROVIDER,
    AI_REDIS,
    EMBEDDING_PORT,
    WEB_SEARCH_PORT,
    AI_USAGE_REPOSITORY,
  ],
})
export class AIModule {}
