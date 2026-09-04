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

const EVENT_PROPERTY_KEYS = {
  'user signed up': ['source'],
  'email verified': ['source', 'verification_method'],
  'note created': ['source', 'actor_type'],
  'note shared': ['source', 'share_type', 'permission'],
  'mcp key created': ['source', 'scope_level'],
} as const satisfies {
  [E in ServerProductEventName]: readonly (keyof ServerProductEventMap[E])[];
};
const ACTOR_PROPERTY_KEYS = [
  'actor_type',
  'is_internal',
  'locale',
] as const satisfies readonly (keyof ServerActorContext)[];
const PERSON_PROPERTY_KEYS = [
  'email',
  'name',
  'role',
  'locale',
  'is_internal',
] as const satisfies readonly (keyof ServerPersonProperties)[];

function pickDefinedProperties(
  properties: object,
  keys: readonly string[]
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  const provided = properties as Record<string, unknown>;

  for (const key of keys) {
    const value = provided[key];
    if (value !== undefined) {
      picked[key] = value;
    }
  }

  return picked;
}

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
          ...pickDefinedProperties(
            input.properties,
            EVENT_PROPERTY_KEYS[input.event]
          ),
          ...pickDefinedProperties(input.actor, ACTOR_PROPERTY_KEYS),
          ...(input.personProperties
            ? {
                $set: pickDefinedProperties(
                  input.personProperties,
                  PERSON_PROPERTY_KEYS
                ),
              }
            : {}),
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
