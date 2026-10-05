import 'reflect-metadata';

import { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  bootConfigModule,
  infrastructureStub,
} from '../../test-support/module-boot';
import { AIModule } from './ai.module';
import { AIConfigService } from './application/services/ai-config.service';
import { ModelGateService } from './application/services/model-gate.service';
import { SystemProviderKeysService } from './application/services/system-provider-keys.service';
import { PLATFORM_MODELS_SOURCE } from './domain/ports/platform-models.port';
import { PlatformResolutionCache } from './infrastructure/catalog/platform-resolution.cache';
import { AI_REDIS } from './infrastructure/redis/ai-redis.provider';
import { ModelGateTokenGuard } from './model-gate-token.guard';
import { ModelGateController } from './model-gate.controller';

const COMPILE_TIMEOUT_MS = 15_000;

const GRAPH_UNDER_TEST: readonly unknown[] = [
  PLATFORM_MODELS_SOURCE,
  AIConfigService,
  PlatformResolutionCache,
  ModelGateService,
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
    "resolves the key service's lazy platform models source to the AI config service",
    async () => {
      const moduleRef = await compileAIModule();

      try {
        const keysModuleRef = Object.values(
          moduleRef.get(SystemProviderKeysService)
        ).find(
          (dependency): dependency is ModuleRef =>
            dependency instanceof ModuleRef
        );
        const source = keysModuleRef?.get(PLATFORM_MODELS_SOURCE);

        // A failing toBe deep-compares and prints both container instances,
        // which runs the worker out of memory; a boolean fails readably.
        expect(
          source === moduleRef.get(AIConfigService),
          "PLATFORM_MODELS_SOURCE is not the module's AIConfigService instance"
        ).toBe(true);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );

  it(
    'resolves the gate controller on the module gate service behind its token guard',
    async () => {
      const moduleRef = await compileAIModule();

      try {
        const controller = moduleRef.get(ModelGateController);

        expect(
          Object.values(controller).includes(moduleRef.get(ModelGateService)),
          "ModelGateController is not wired to the module's ModelGateService"
        ).toBe(true);
        expect(
          moduleRef.get(ModelGateTokenGuard) instanceof ModelGateTokenGuard,
          'ModelGateTokenGuard does not resolve in the AI module'
        ).toBe(true);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );
});
