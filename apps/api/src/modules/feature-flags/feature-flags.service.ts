import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

import { AdminAuditService } from '../admin/audit/admin-audit.service';
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
    private readonly cache: Cache,
    private readonly adminAuditService: AdminAuditService
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
    actorId: string,
    description?: string
  ): Promise<FeatureFlagEntity> {
    const previous = await this.repository.findByKey(key);

    const flag = await this.repository.upsert({
      key,
      enabled,
      ...(description !== undefined && { description }),
    });

    await this.cache.del(`${CACHE_PREFIX}${key}`);

    this.logger.log(`Feature flag '${key}' set to ${enabled}`);

    const descriptionChanged = previous
      ? previous.description !== flag.description
      : flag.description !== null;

    await this.adminAuditService.record({
      actorId,
      action: 'flag.updated',
      targetType: 'feature_flag',
      targetId: key,
      ...(previous
        ? {
            before: {
              enabled: previous.enabled,
              ...(descriptionChanged
                ? { description: previous.description }
                : {}),
            },
          }
        : {}),
      after: {
        enabled: flag.enabled,
        ...(descriptionChanged ? { description: flag.description } : {}),
      },
    });

    return flag;
  }

  async getAll(): Promise<FeatureFlagEntity[]> {
    return this.repository.findAll();
  }

  async remove(key: string, actorId: string): Promise<void> {
    const existing = await this.repository.findByKey(key);
    if (!existing) {
      return;
    }

    await this.repository.delete(key);

    await this.cache.del(`${CACHE_PREFIX}${key}`);

    this.logger.log(`Feature flag '${key}' removed`);

    await this.adminAuditService.record({
      actorId,
      action: 'flag.deleted',
      targetType: 'feature_flag',
      targetId: key,
      before: {
        enabled: existing.enabled,
        description: existing.description,
      },
    });
  }
}
