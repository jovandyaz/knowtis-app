import 'reflect-metadata';

import * as path from 'node:path';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { I18nModule } from 'nestjs-i18n';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE } from '@knowtis/shared-util';

import { validateEnv, type EnvConfig } from '../../../config/env.config';
import { DatabaseModule } from '../../../database';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { AgentModule } from '../agent.module';
import type { AgentEvent, WebSource } from '../domain/agent-event';
import {
  AGENT_ORCHESTRATOR,
  type AgentOrchestrator,
} from '../domain/ports/agent-orchestrator.port';

loadEnv({ path: ['.env.local', '.env'] });

const GATE =
  !!process.env['TAVILY_API_KEY']?.trim() &&
  !!process.env['ANTHROPIC_API_KEY']?.trim();
const USER = '00000000-0000-4000-8000-0000000000fa';
const DEFAULT_AGENT_MODEL = 'anthropic:claude-sonnet-4-6';

describe.runIf(GATE)('web search tool quality', () => {
  let orchestrator: AgentOrchestrator;
  let maxSteps: number;
  let moduleClose: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
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
      ],
    })
      .overrideProvider(FeatureFlagsService)
      .useValue({
        isEnabled: (key: string) => Promise.resolve(key === 'agent_web_search'),
      })
      .compile();
    await moduleRef.init();
    moduleClose = () => moduleRef.close();

    orchestrator = moduleRef.get<AgentOrchestrator>(AGENT_ORCHESTRATOR, {
      strict: false,
    });
    const config = moduleRef.get<ConfigService<EnvConfig, true>>(
      ConfigService,
      {
        strict: false,
      }
    );
    maxSteps = config.get('AI_AGENT_MAX_STEPS');
  }, 120_000);

  afterAll(async () => {
    if (moduleClose) {
      await moduleClose();
    }
  });

  it('cites web sources for a current public-web question', async () => {
    const model = process.env['AI_EVAL_MODEL']?.trim() || DEFAULT_AGENT_MODEL;
    const events = orchestrator.run({
      userId: USER,
      messages: [
        {
          role: 'user',
          content:
            'Search the public web and tell me: what is the latest stable major version of Node.js? Cite the source url.',
        },
      ],
      model,
      maxSteps,
    });

    let webSources: readonly WebSource[] = [];
    for await (const event of events as AsyncIterable<AgentEvent>) {
      if (event.type === 'done') {
        webSources = event.webSources;
      }
    }

    expect(webSources.length).toBeGreaterThanOrEqual(1);
    expect(webSources[0]?.url).toMatch(/^https?:\/\//);
  }, 120_000);
});

if (!GATE) {
  describe('web search tool quality', () => {
    it.skip('requires TAVILY_API_KEY and ANTHROPIC_API_KEY', () => undefined);
  });
}
