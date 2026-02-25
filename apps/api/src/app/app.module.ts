import * as path from 'path';

import { EmailModule } from '@jovandyaz/email-nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';

import { DEFAULT_LOCALE } from '@knowtis/shared-i18n';

import { validateEnv } from '../config';
import type { EnvConfig } from '../config/env.config';
import { DatabaseModule } from '../database';
import { AuthModule } from '../modules/auth';
import { AuthorizationModule } from '../modules/authorization';
import { CollaborationModule } from '../modules/collaboration';
import { FeatureFlagsModule } from '../modules/feature-flags';
import { HealthModule } from '../modules/health';
import { NotesModule } from '../modules/notes';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    EventEmitterModule.forRoot(),
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
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    AuthorizationModule,
    NotesModule,
    CollaborationModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
