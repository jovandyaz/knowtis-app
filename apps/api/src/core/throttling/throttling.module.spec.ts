import { Controller, Get, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Throttle } from '@nestjs/throttler';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ThrottlingModule } from './throttling.module';

const ACCESS_TOKEN_SECRET = 'a'.repeat(32) + '-access-secret';
const USER_A = '00000000-0000-4000-8000-0000000000a1';
const USER_B = '00000000-0000-4000-8000-0000000000b2';
const TTL_MS = 60_000;
// Spelled out rather than imported from throttling.module.ts: a budget read
// from the value under test would keep passing wherever that value drifted to.
const DEFAULT_REQUESTS_PER_WINDOW = 60;

const configService = new ConfigService({ JWT_SECRET: ACCESS_TOKEN_SECRET });

@Controller('probe')
class ProbeController {
  @Throttle({ default: { limit: 1, ttl: TTL_MS } })
  @Get()
  get() {
    return { ok: true };
  }

  @Get('unthrottled')
  unthrottled() {
    return { ok: true };
  }
}

// ConfigModule.forRoot makes ConfigService global in the real app; the
// resolver inside ThrottlingModule cannot see a locally scoped one.
@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: configService }],
  exports: [ConfigService],
})
class StubConfigModule {}

@Module({
  imports: [StubConfigModule, ThrottlingModule],
  controllers: [ProbeController],
})
class ProbeModule {}

describe('ThrottlingModule', () => {
  const jwtService = new JwtService({});
  let app: NestExpressApplication;
  let baseUrl: string;
  let tokenA: string;
  let tokenB: string;
  let forgedToken: string;
  let visitorToken: string;

  function sign(sub: string, secret: string): Promise<string> {
    return jwtService.signAsync({ sub }, { secret, algorithm: 'HS256' });
  }

  async function probeAt(path: string, token?: string): Promise<number> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });
    return response.status;
  }

  async function probeAs(headers: Record<string, string>): Promise<number> {
    const response = await fetch(`${baseUrl}/probe`, { headers });
    return response.status;
  }

  async function probe(token?: string): Promise<number> {
    return probeAt('/probe', token);
  }

  beforeAll(async () => {
    tokenA = await sign(USER_A, ACCESS_TOKEN_SECRET);
    tokenB = await sign(USER_B, ACCESS_TOKEN_SECRET);
    forgedToken = await sign(USER_B, 'a-secret-this-api-never-signed-with');
    visitorToken = await jwtService.signAsync(
      { sub: USER_B, isAnonymous: true },
      { secret: ACCESS_TOKEN_SECRET, algorithm: 'HS256' }
    );
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', 1);
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterEach(async () => {
    await app.close();
  });

  it('spends the route budget the caller owns, not the one their IP shares', async () => {
    expect(await probe(tokenA)).toBe(200);
    expect(await probe(tokenA)).toBe(429);

    expect(await probe(tokenB)).toBe(200);
  });

  it('leaves a signed-out caller a full budget after a user spends theirs', async () => {
    expect(await probe(tokenA)).toBe(200);
    expect(await probe(tokenA)).toBe(429);

    expect(await probe()).toBe(200);
    expect(await probe()).toBe(429);
  });

  it('refuses a forged token the fresh bucket its subject would buy', async () => {
    expect(await probe()).toBe(200);

    expect(await probe(forgedToken)).toBe(429);
  });

  it('keeps a mintable anonymous session on the shared IP bucket', async () => {
    expect(await probe()).toBe(200);

    expect(await probe(visitorToken)).toBe(429);
  });

  it('gives a route that sets no budget of its own the module default, and 429s the request past it', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < DEFAULT_REQUESTS_PER_WINDOW; index += 1) {
      statuses.push(await probeAt('/probe/unthrottled', tokenA));
    }

    expect(new Set(statuses)).toEqual(new Set([200]));
    expect(await probeAt('/probe/unthrottled', tokenA)).toBe(429);
  });

  it('keys a signed-out caller on the edge-set X-Real-IP, not on X-Forwarded-For', async () => {
    const edgeIp = '203.0.113.7';
    expect(
      await probeAs({ 'x-real-ip': edgeIp, 'x-forwarded-for': '10.0.0.1' })
    ).toBe(200);

    // Rotating the client-controlled header must not buy a fresh bucket.
    expect(
      await probeAs({ 'x-real-ip': edgeIp, 'x-forwarded-for': '10.0.0.2' })
    ).toBe(429);
  });

  it('gives signed-out callers behind different edge IPs their own buckets', async () => {
    expect(await probeAs({ 'x-real-ip': '203.0.113.7' })).toBe(200);

    expect(await probeAs({ 'x-real-ip': '203.0.113.8' })).toBe(200);
  });
});
