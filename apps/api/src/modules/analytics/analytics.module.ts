import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

import type { EnvConfig } from '../../config/env.config';
import { UsersModule } from '../users/users.module';
import { ProductAnalyticsListener } from './product-analytics.listener';
import { ProductAnalytics } from './product-analytics.service';

const POSTHOG_CLIENT = Symbol('POSTHOG_CLIENT');

@Module({
  imports: [ConfigModule, UsersModule],
  providers: [
    {
      provide: POSTHOG_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => {
        const token = configService.get('POSTHOG_PROJECT_TOKEN');
        if (configService.get('NODE_ENV') !== 'production' || !token) {
          return null;
        }

        return new PostHog(token, {
          host: configService.get('POSTHOG_HOST'),
        });
      },
    },
    {
      provide: ProductAnalytics,
      inject: [POSTHOG_CLIENT, ConfigService],
      useFactory: (
        client: PostHog | null,
        configService: ConfigService<EnvConfig, true>
      ) => new ProductAnalytics(client, configService),
    },
    ProductAnalyticsListener,
  ],
  exports: [ProductAnalytics],
})
export class AnalyticsModule {}
