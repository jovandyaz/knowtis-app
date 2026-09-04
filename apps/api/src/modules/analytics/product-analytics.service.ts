import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostHog } from 'posthog-node';

import type { EnvConfig } from '../../config/env.config';
import type {
  ServerActorContext,
  ServerPersonProperties,
  ServerProductEventMap,
  ServerProductEventName,
} from './product-analytics.events';

@Injectable()
export class ProductAnalytics implements OnApplicationShutdown {
  private readonly logger = new Logger(ProductAnalytics.name);

  constructor(
    private readonly client: PostHog | null,
    configService: ConfigService<EnvConfig, true>
  ) {
    this.commonProperties = {
      environment: configService.get('NODE_ENV'),
      app_version: configService.get('RAILWAY_GIT_COMMIT_SHA') ?? '0.1.0',
    };
  }

  private readonly commonProperties: {
    environment: EnvConfig['NODE_ENV'];
    app_version: string;
  };

  capture<E extends ServerProductEventName>(input: {
    distinctId: string;
    event: E;
    properties: ServerProductEventMap[E];
    actor: ServerActorContext;
    personProperties?: ServerPersonProperties;
  }): void {
    if (!this.client) {
      return;
    }

    try {
      this.client.capture({
        distinctId: input.distinctId,
        event: input.event,
        properties: {
          ...this.commonProperties,
          ...input.properties,
          ...input.actor,
          ...(input.personProperties ? { $set: input.personProperties } : {}),
        },
      });
    } catch {
      this.logger.error(`PostHog capture failed for event: ${input.event}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.shutdown();
    } catch {
      this.logger.error('PostHog shutdown failed');
    }
  }
}
