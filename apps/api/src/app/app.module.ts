import * as path from 'path';

import { EmailModule } from '@jovandyaz/email-nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';

import { DEFAULT_LOCALE } from '@knowtis/shared-util';

import { validateEnv } from '../config';
import type { EnvConfig } from '../config/env.config';
import { ThrottlingModule } from '../core/throttling/throttling.module';
import { DatabaseModule } from '../database';
import { AdminModule } from '../modules/admin/admin.module';
import { AgentModule } from '../modules/agent/agent.module';
import { AIModule } from '../modules/ai';
import { ArtifactsModule } from '../modules/artifacts';
import { AuthModule } from '../modules/auth';
import { AuthorizationModule } from '../modules/authorization';
import { CollaborationModule } from '../modules/collaboration';
import { FeatureFlagsModule } from '../modules/feature-flags';
import { HealthModule } from '../modules/health';
import { McpModule } from '../modules/mcp/mcp.module';
import { NotesModule } from '../modules/notes';
import { OauthModule } from '../modules/oauth/oauth.module';
import { ObservabilityModule } from '../modules/observability/observability.module';
import { OrganizationModule } from '../modules/organization/organization.module';
import { SearchModule } from '../modules/search';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['apps/api/.env.local', 'apps/api/.env'],
    }),
    ThrottlingModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    I18nModule.forRoot({
      fallbackLanguage: DEFAULT_LOCALE,
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        new HeaderResolver(['x-lang']),
        AcceptLanguageResolver,
      ],
    }),
    DatabaseModule,
    FeatureFlagsModule,
    EmailModule.forRootAsync({
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        provider: configService.get('EMAIL_PROVIDER'),
        resend: { apiKey: configService.get('RESEND_API_KEY') ?? '' },
        defaults: { from: configService.get('EMAIL_FROM') },
        environment: configService.get('NODE_ENV'),
      }),
      inject: [ConfigService],
    }),
    AdminModule,
    AgentModule,
    AIModule,
    ArtifactsModule,
    AuthModule,
    AuthorizationModule,
    McpModule,
    NotesModule,
    OrganizationModule,
    OauthModule,
    SearchModule,
    CollaborationModule,
    HealthModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
