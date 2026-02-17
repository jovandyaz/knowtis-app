import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

import {
  FEATURE_FLAG_REPOSITORY,
  type FeatureFlagEntity,
  type FeatureFlagRepository,
} from './domain/feature-flag.repository';

const CACHE_PREFIX = 'ff:';
const CACHE_TTL = 30000;

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    @Inject(FEATURE_FLAG_REPOSITORY)
    private readonly repository: FeatureFlagRepository,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache
  ) {}

  async isEnabled(key: string): Promise<boolean> {
    const cacheKey = `${CACHE_PREFIX}${key}`;

    const cached = await this.cache.get<boolean>(cacheKey);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const flag = await this.repository.findByKey(key);
    const enabled = flag?.enabled ?? false;

    await this.cache.set(cacheKey, enabled, CACHE_TTL);

    return enabled;
  }

  async toggle(
    key: string,
    enabled: boolean,
    description?: string
  ): Promise<FeatureFlagEntity> {
    const flag = await this.repository.upsert({
      key,
      enabled,
      ...(description !== undefined && { description }),
    });

    await this.cache.del(`${CACHE_PREFIX}${key}`);

    this.logger.log(`Feature flag '${key}' set to ${enabled}`);

    return flag;
  }

  async getAll(): Promise<FeatureFlagEntity[]> {
    return this.repository.findAll();
  }

  async remove(key: string): Promise<void> {
    await this.repository.delete(key);

    await this.cache.del(`${CACHE_PREFIX}${key}`);

    this.logger.log(`Feature flag '${key}' removed`);
  }
}
