import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';

import type { EnvConfig } from '../../../../config/env.config';
import {
  AI_CONFIG_REPOSITORY,
  type AIConfigRepository,
} from '../../domain/ports/ai-config.repository';

const CACHE_PREFIX = 'ai:config:';
const CACHE_TTL_MS = 30_000; // 30 seconds

const ALLOWED_KEYS = new Set([
  'ai_default_model',
  'ai_fast_model',
  'ai_fallback_model',
]);

@Injectable()
export class AIConfigService {
  private readonly logger = new Logger(AIConfigService.name);

  constructor(
    @Inject(AI_CONFIG_REPOSITORY)
    private readonly repository: AIConfigRepository,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
    private readonly configService: ConfigService<EnvConfig, true>
  ) {}

  async getDefaultModel(): Promise<string> {
    return this.getConfigValue('ai_default_model', 'AI_DEFAULT_MODEL');
  }

  async getFastModel(): Promise<string> {
    return this.getConfigValue('ai_fast_model', 'AI_FAST_MODEL');
  }

  async getFallbackModel(): Promise<string> {
    return this.getConfigValue('ai_fallback_model', 'AI_FALLBACK_MODEL');
  }

  async setConfig(
    key: string,
    value: string,
    description?: string
  ): Promise<void> {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`Unknown AI config key: '${key}'`);
    }
    await this.repository.set(key, value, description);
    await this.cache.del(`${CACHE_PREFIX}${key}`);
    this.logger.log(`AI config '${key}' updated to '${value}'`);
  }

  /** Returns all config rows directly from DB (no cache — intentional for admin freshness). */
  async getAllConfig(): Promise<Record<string, string>> {
    return this.repository.getAll();
  }

  private async getConfigValue(
    dbKey: string,
    envKey: keyof EnvConfig
  ): Promise<string> {
    const cacheKey = `${CACHE_PREFIX}${dbKey}`;

    const cached = await this.cache.get<string>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const dbValue = await this.repository.get(dbKey);
      if (dbValue) {
        await this.cache.set(cacheKey, dbValue, CACHE_TTL_MS);
        return dbValue;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to read AI config '${dbKey}' from DB, using env fallback`,
        error
      );
    }

    return this.configService.get(envKey) as string;
  }
}
