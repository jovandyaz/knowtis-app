import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { EnvConfig } from '../../../../config/env.config';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';

export const AI_REDIS = Symbol('AI_REDIS');

@Injectable()
export class AIRedisProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AIRedisProvider.name);
  readonly client: Redis;

  constructor(
    configService: ConfigService<EnvConfig, true>,
    private readonly featureFlagsService: FeatureFlagsService
  ) {
    this.client = new Redis(configService.get('REDIS_URL'), {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });
  }

  async onModuleInit() {
    const aiEnabled = await this.featureFlagsService.isEnabled('ai_enabled');
    if (!aiEnabled) {
      this.logger.log('AI disabled — skipping Redis connection');
      return;
    }

    try {
      await this.client.connect();
    } catch (err) {
      this.logger.error('Failed to connect to Redis', err);
    }
  }

  async onModuleDestroy() {
    if (
      this.client.status === 'ready' ||
      this.client.status === 'connecting' ||
      this.client.status === 'connect'
    ) {
      await this.client.quit();
    } else {
      this.client.disconnect();
    }
  }
}
