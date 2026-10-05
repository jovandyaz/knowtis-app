import 'reflect-metadata';

import { CronExpression } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  bootConfigModule,
  infrastructureStub,
} from '../../test-support/module-boot';
import { AIModule } from './ai.module';
import { AIConfigService } from './application/services/ai-config.service';
import { ByokModelsService } from './application/services/byok-models.service';
import { ByokService } from './application/services/byok.service';
import { ModelGateService } from './application/services/model-gate.service';
import { SystemProviderKeysService } from './application/services/system-provider-keys.service';
import {
  KEY_FINGERPRINTER,
  type KeyFingerprinter,
} from './domain/ports/key-fingerprinter.port';
import {
  PINNED_MODELS_SOURCE,
  PLATFORM_MODELS_SOURCE,
} from './domain/ports/platform-models.port';
import { PROVIDER_MODELS_LISTER } from './domain/ports/provider-models.port';
import { USER_PROVIDER_MODELS_REPOSITORY } from './domain/ports/user-provider-models.repository';
import { ByokRelistTask } from './infrastructure/byok/byok-relist.task';
import { CatalogAlertsWriter } from './infrastructure/catalog/catalog-alerts.writer';
import { CatalogSyncTask } from './infrastructure/catalog/catalog-sync.task';
import { PlatformCandidatesWriter } from './infrastructure/catalog/platform-candidates.writer';
import { PlatformResolutionCache } from './infrastructure/catalog/platform-resolution.cache';
import { SyncStalenessTask } from './infrastructure/catalog/sync-staleness.task';
import { HttpProviderModelsLister } from './infrastructure/providers/listing/http-provider-models.lister';
import { AI_REDIS } from './infrastructure/redis/ai-redis.provider';
import { ModelGateController } from './model-gate.controller';

const COMPILE_TIMEOUT_MS = 15_000;
const HMAC_SHA256_HEX = /^[0-9a-f]{64}$/;
// The key @nestjs/schedule's explorer reads a @Cron from; the package does not export it.
const CRON_METADATA_KEY = 'SCHEDULE_CRON_OPTIONS';

const GRAPH_UNDER_TEST: readonly unknown[] = [
  PLATFORM_MODELS_SOURCE,
  PINNED_MODELS_SOURCE,
  AIConfigService,
  PlatformResolutionCache,
  ModelGateService,
  CatalogAlertsWriter,
  CatalogSyncTask,
  PlatformCandidatesWriter,
  SyncStalenessTask,
  PROVIDER_MODELS_LISTER,
  USER_PROVIDER_MODELS_REPOSITORY,
  KEY_FINGERPRINTER,
  ByokModelsService,
  ByokRelistTask,
];

// A stand-in for a token under test would hide the missing registration this
// spec exists to catch, so those fail resolution instead.
const mockAllButTheGraphUnderTest = (token: unknown) =>
  GRAPH_UNDER_TEST.includes(token) ? undefined : infrastructureStub();

describe('AIModule wiring', () => {
  const compileAIModule = () =>
    Test.createTestingModule({
      imports: [bootConfigModule(), AIModule],
    })
      .overrideProvider(AI_REDIS)
      .useValue(infrastructureStub())
      .useMocker(mockAllButTheGraphUnderTest)
      .compile();

  it(
    'gives the BYOK and system key services one model lister',
    async () => {
      const moduleRef = await compileAIModule();

      try {
        const lister = moduleRef.get(PROVIDER_MODELS_LISTER);

        // A failing toBe deep-compares and prints both container instances,
        // which runs the worker out of memory; a boolean fails readably.
        expect(
          [ByokService, SystemProviderKeysService].every((token) =>
            Object.values(moduleRef.get(token)).includes(lister)
          ),
          "the key services do not share the module's PROVIDER_MODELS_LISTER"
        ).toBe(true);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );

  it(
    'resolves the gate controller on the module gate service',
    async () => {
      const moduleRef = await compileAIModule();

      try {
        const controller = moduleRef.get(ModelGateController);

        expect(
          Object.values(controller).includes(moduleRef.get(ModelGateService)),
          "ModelGateController is not wired to the module's ModelGateService"
        ).toBe(true);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );

  it(
    'raises every watch alert through the module alert writer, reading pins from the AI config service',
    async () => {
      const moduleRef = await compileAIModule();

      try {
        const writer = moduleRef.get(CatalogAlertsWriter);
        const unwired = [
          CatalogSyncTask,
          PlatformCandidatesWriter,
          ModelGateService,
          SyncStalenessTask,
        ].filter(
          (token) => !Object.values(moduleRef.get(token)).includes(writer)
        );

        expect(
          unwired.map((token) => token.name),
          "providers not wired to the module's CatalogAlertsWriter"
        ).toEqual([]);
        expect(
          moduleRef.get(PINNED_MODELS_SOURCE) ===
            moduleRef.get(AIConfigService),
          "PINNED_MODELS_SOURCE is not the module's AIConfigService instance"
        ).toBe(true);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );

  it(
    'provides the HTTP model lister',
    async () => {
      const moduleRef = await compileAIModule();

      try {
        expect(
          moduleRef.get(PROVIDER_MODELS_LISTER) instanceof
            HttpProviderModelsLister,
          'PROVIDER_MODELS_LISTER is not an HttpProviderModelsLister'
        ).toBe(true);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );

  it(
    'fingerprints keys with the token hash key',
    async () => {
      const moduleRef = await compileAIModule();

      try {
        expect(
          moduleRef.get<KeyFingerprinter>(KEY_FINGERPRINTER).hash('x')
        ).toMatch(HMAC_SHA256_HEX);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );

  it(
    'schedules the BYOK re-list task',
    async () => {
      const moduleRef = await compileAIModule();

      try {
        const task = moduleRef.get(ByokRelistTask);

        expect(
          Object.values(task).includes(moduleRef.get(ByokModelsService)),
          "ByokRelistTask is not wired to the module's ByokModelsService"
        ).toBe(true);
        expect(Reflect.getMetadata(CRON_METADATA_KEY, task.relistDue)).toEqual({
          cronTime: CronExpression.EVERY_DAY_AT_4AM,
          timeZone: 'UTC',
        });
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );
});
