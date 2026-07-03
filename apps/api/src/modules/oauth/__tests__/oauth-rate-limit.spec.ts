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

function postPath(
  base: string,
  path: string,
  forwardedFor: string
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'x-forwarded-for': forwardedFor,
      'content-type': 'application/json',
    },
    body: '{}',
  });
}

function postReg(base: string, forwardedFor: string): Promise<Response> {
  return postPath(base, '/oauth/reg', forwardedFor);
}

function getAuthorize(base: string, forwardedFor: string): Promise<Response> {
  return fetch(`${base}/oauth/auth`, {
    headers: { 'x-forwarded-for': forwardedFor },
  });
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
    expect(body.error_description).toBe(
      'Too many requests to the OAuth endpoint. Try again later.'
    );
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('should key the strict limit per forwarded client IP', async () => {
    const exhausted = '198.51.100.20';
    for (let i = 0; i < DCR_LIMIT; i++) {
      const res = await postReg(harness.base, exhausted);
      expect(res.status).not.toBe(429);
    }
    const blocked = await postReg(harness.base, exhausted);
    expect(blocked.status).toBe(429);

    const fresh = '198.51.100.21';
    const allowed = await postReg(harness.base, fresh);
    expect(allowed.status).not.toBe(429);
  });

  it('should ignore a client-spoofed X-Forwarded-For prefix and key on the proxy-appended IP', async () => {
    const realIp = '203.0.113.77';
    // One Railway hop: attacker rotates the leading (spoofed) XFF entry, the
    // proxy always appends the same real IP last, trust proxy:1 keys on it.
    for (let i = 0; i < DCR_LIMIT; i++) {
      const res = await postReg(harness.base, `10.0.0.${i}, ${realIp}`);
      expect(res.status).not.toBe(429);
    }

    const blocked = await postReg(harness.base, `10.0.0.250, ${realIp}`);
    expect(blocked.status).toBe(429);
  });

  it.each([
    ['/oauth/reg', '203.0.113.1'],
    ['/oauth/reg/', '203.0.113.2'],
    ['/oauth/REG', '203.0.113.3'],
  ])('should route POST %s to the strict DCR tier', async (path, ip) => {
    for (let i = 0; i < DCR_LIMIT; i++) {
      const res = await postPath(harness.base, path, ip);
      expect(res.status).not.toBe(429);
    }

    const blocked = await postPath(harness.base, path, ip);
    expect(blocked.status).toBe(429);
  });

  it('should leave POST /oauth/reg/:clientId (RFC 7592) on the looser tier', async () => {
    const ip = '203.0.113.4';
    // Past the strict DCR limit it is still allowed (not the strict tier)...
    for (let i = 0; i <= DCR_LIMIT; i++) {
      const res = await postPath(harness.base, '/oauth/reg/abc123', ip);
      expect(res.status).not.toBe(429);
    }
    // ...but it is still governed by the looser tier and blocks at its ceiling,
    // so it is never left completely unthrottled.
    let blocked = false;
    for (let i = 0; i <= OAUTH_LIMIT; i++) {
      const res = await postPath(harness.base, '/oauth/reg/abc123', ip);
      if (res.status === 429) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
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
