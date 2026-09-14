import 'reflect-metadata';

import { Body, Controller, Module, Put } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { I18nValidationPipe } from 'nestjs-i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UpsertFeatureFlagDto } from '../../modules/feature-flags/dto/feature-flags.dto';

@Controller('flags')
class ProbeController {
  @Put('probe')
  upsert(@Body() dto: UpsertFeatureFlagDto) {
    return dto;
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('a boolean flag sent through the same pipe main.ts installs', () => {
  let app: NestExpressApplication;
  let baseUrl: string;

  async function send(body: unknown) {
    const response = await fetch(`${baseUrl}/flags/probe`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new I18nValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([true, false])(
    'stores the boolean %s the caller sent',
    async (enabled) => {
      const response = await send({ enabled });

      expect(response.status).toBe(200);
      expect(response.body['enabled']).toBe(enabled);
    }
  );

  it.each(['no', 'false', 'off', 0, 1])(
    'refuses %p instead of turning the flag on',
    async (enabled) => {
      expect((await send({ enabled })).status).toBe(400);
    }
  );

  it('refuses a missing flag state', async () => {
    expect((await send({ description: 'no state' })).status).toBe(400);
  });

  it('refuses an explicit null', async () => {
    expect((await send({ enabled: null })).status).toBe(400);
  });
});
