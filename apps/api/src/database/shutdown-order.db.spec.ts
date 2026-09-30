import { Module, type BeforeApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { AgentGateway } from '../modules/agent/agent.gateway';
import { AIRedisProvider } from '../modules/ai/infrastructure/redis/ai-redis.provider';
import { FeatureFlagsService } from '../modules/feature-flags/feature-flags.service';
import { AccessDatabase } from '../modules/notes/infrastructure/persistence/access-database';
import {
  DATABASE_CLIENT,
  DATABASE_CONNECTION,
  DatabaseModule,
} from './database.module';

const order: string[] = [];

class DrainProbe implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(): Promise<void> {
    order.push('drain:start');
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push('drain:end');
  }
}

@Module({
  providers: [
    DrainProbe,
    AIRedisProvider,
    {
      provide: ConfigService,
      useValue: { get: () => 'redis://127.0.0.1:1' },
    },
    {
      provide: FeatureFlagsService,
      useValue: { isEnabled: vi.fn().mockResolvedValue(false) },
    },
  ],
})
class ProbeModule {}

describe('shutdown hook order', () => {
  it('closes Postgres and the AI Redis client only after every drain hook finished', async () => {
    order.length = 0;
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, ProbeModule],
    })
      .overrideProvider(DATABASE_CLIENT)
      .useValue({
        end: vi.fn(async () => {
          order.push('db:end');
        }),
      })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue({})
      .compile();
    await moduleRef.init();
    vi.spyOn(
      moduleRef.get(AIRedisProvider).client,
      'disconnect'
    ).mockImplementation(() => {
      order.push('redis:close');
    });

    await moduleRef.close();

    expect(order.indexOf('drain:end')).toBeGreaterThan(-1);
    expect(order.indexOf('db:end')).toBeGreaterThan(order.indexOf('drain:end'));
    expect(order.indexOf('redis:close')).toBeGreaterThan(
      order.indexOf('drain:end')
    );
  });

  it('drains agent turns before shutdown and closes the access pool on shutdown', () => {
    expect(AgentGateway.prototype).toHaveProperty('beforeApplicationShutdown');
    expect(AccessDatabase.prototype).toHaveProperty('onApplicationShutdown');
    expect(AccessDatabase.prototype).not.toHaveProperty('onModuleDestroy');
  });
});
