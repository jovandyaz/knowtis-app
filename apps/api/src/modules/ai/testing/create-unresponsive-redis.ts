import { createServer, type Socket } from 'node:net';

import type { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../config/env.config';
import type { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { AIRedisProvider } from '../infrastructure/redis/ai-redis.provider';

const LOOPBACK = '127.0.0.1';

/** A real `AIRedisProvider` pointed at a server that accepts the connection and never answers, the shape of a stalled Redis. */
export async function createUnresponsiveRedis() {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the unresponsive Redis has no TCP port');
  }
  const config = {
    get: () => `redis://${LOOPBACK}:${address.port}`,
  } as unknown as ConfigService<EnvConfig, true>;
  const flags = {
    isEnabled: async () => true,
  } as unknown as FeatureFlagsService;
  const provider = new AIRedisProvider(config, flags);
  return {
    provider,
    async close() {
      provider.client.disconnect();
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
