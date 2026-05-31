import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AI_ACTION } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import type { AICache, CachedResult } from '../../domain/ports/ai-cache.port';
import { AI_REDIS, AIRedisProvider } from './ai-redis.provider';

const CACHEABLE_ACTIONS: Set<string> = new Set([
  AI_ACTION.SUMMARIZE,
  AI_ACTION.TRANSLATE,
  AI_ACTION.OUTLINE,
  AI_ACTION.ACTION_ITEMS,
]);

@Injectable()
export class ExactMatchCacheService implements AICache {
  private readonly logger = new Logger(ExactMatchCacheService.name);

  constructor(
    @Inject(AI_REDIS) private readonly redis: AIRedisProvider,
    private readonly configService: ConfigService<EnvConfig, true>
  ) {}

  isCacheable(action: string): boolean {
    return CACHEABLE_ACTIONS.has(action);
  }

  private buildKey(
    userId: string,
    action: string,
    model: string,
    prompt: string
  ): string {
    const hash = createHash('sha256')
      .update(`${userId}:${action}:${model}:${prompt}`)
      .digest('hex');
    return `ai:cache:${hash}`;
  }

  async get(
    userId: string,
    action: string,
    model: string,
    prompt: string
  ): Promise<CachedResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const key = this.buildKey(userId, action, model, prompt);
      const cached = await this.redis.client.get(key);
      if (!cached) {
        return null;
      }

      this.logger.debug({ event: 'ai.cache.hit', action, model });
      return JSON.parse(cached) as CachedResult;
    } catch (error) {
      this.logger.warn('Cache get failed', error);
      return null;
    }
  }

  async set(
    userId: string,
    action: string,
    model: string,
    prompt: string,
    result: CachedResult
  ): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const key = this.buildKey(userId, action, model, prompt);
      const ttl = this.configService.get('AI_CACHE_TTL_SECONDS');
      await this.redis.client.set(key, JSON.stringify(result), 'EX', ttl);
      this.logger.debug({ event: 'ai.cache.set', action, model });
    } catch (error) {
      this.logger.warn('Cache set failed', error);
    }
  }

  private isEnabled(): boolean {
    return this.configService.get('AI_CACHE_ENABLED');
  }
}
