import * as path from 'node:path';

import type { ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { I18nModule } from 'nestjs-i18n';

import { DEFAULT_LOCALE } from '@knowtis/shared-util';

import { validateEnv } from '../../../config/env.config';
import { DatabaseModule } from '../../../database';
import { AgentModule } from '../agent.module';

/** `AgentModule` plus the global context AppModule gives it; Schedule, Collaboration and the i18n watcher stay out because of their side effects. */
export function agentEvalModuleImports(): NonNullable<
  ModuleMetadata['imports']
> {
  return [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    EventEmitterModule.forRoot(),
    I18nModule.forRoot({
      fallbackLanguage: DEFAULT_LOCALE,
      loaderOptions: {
        path: path.join(__dirname, '../../../i18n'),
        watch: false,
      },
    }),
    DatabaseModule,
    AgentModule,
  ];
}
