import { Controller, Get, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOauthRateLimit } from '../oauth-rate-limit.middleware';

const DCR_LIMIT = 3;
const OAUTH_LIMIT = 6;
const WINDOW_MS = 60_000;

@Controller()
class StubController {
  @Get('ping')
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

interface Harness {
  app: NestExpressApplication;
  base: string;
}

async function buildHarness(): Promise<Harness> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [StubController],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  app.set('trust proxy', 1);
  app.use(
    createOauthRateLimit({
      dcr: { windowMs: WINDOW_MS, limit: DCR_LIMIT },
      oauth: { windowMs: WINDOW_MS, limit: OAUTH_LIMIT },
    })
  );
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });
  await app.listen(0, '127.0.0.1');
  return { app, base: await app.getUrl() };
}

function postReg(base: string, ip: string): Promise<Response> {
  return fetch(`${base}/oauth/reg`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
    body: '{}',
  });
}

function getAuthorize(base: string, ip: string): Promise<Response> {
  return fetch(`${base}/oauth/auth`, { headers: { 'x-forwarded-for': ip } });
}

describe('OAuth rate limit', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await buildHarness();
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('should 429 DCR registration with an RFC error and Retry-After past the strict limit', async () => {
    const ip = '198.51.100.10';
    for (let i = 0; i < DCR_LIMIT; i++) {
      const res = await postReg(harness.base, ip);
      expect(res.status).not.toBe(429);
    }

    const blocked = await postReg(harness.base, ip);
    const body = (await blocked.json()) as {
      error?: string;
      error_description?: string;
    };

    expect(blocked.status).toBe(429);
    expect(body.error).toBe('temporarily_unavailable');
    expect(body.error_description).toBeTruthy();
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it('should key the strict limit per client IP via trust proxy', async () => {
    const exhausted = '198.51.100.20';
    for (let i = 0; i <= DCR_LIMIT; i++) {
      await postReg(harness.base, exhausted);
    }
    const blocked = await postReg(harness.base, exhausted);
    expect(blocked.status).toBe(429);

    const fresh = '198.51.100.21';
    const allowed = await postReg(harness.base, fresh);
    expect(allowed.status).not.toBe(429);
  });

  it('should never rate-limit non-oauth paths', async () => {
    const ip = '198.51.100.30';
    const total = DCR_LIMIT + OAUTH_LIMIT + 5;
    for (let i = 0; i < total; i++) {
      const res = await fetch(`${harness.base}/api/v1/ping`, {
        headers: { 'x-forwarded-for': ip },
      });
      expect(res.status).toBe(200);
    }
  });

  it('should allow more token/authorize requests than the strict DCR limit', async () => {
    const ip = '198.51.100.40';
    for (let i = 0; i < OAUTH_LIMIT; i++) {
      const res = await getAuthorize(harness.base, ip);
      expect(res.status).not.toBe(429);
    }

    const blocked = await getAuthorize(harness.base, ip);
    const body = (await blocked.json()) as { error?: string };

    expect(blocked.status).toBe(429);
    expect(body.error).toBe('temporarily_unavailable');
  });
});
