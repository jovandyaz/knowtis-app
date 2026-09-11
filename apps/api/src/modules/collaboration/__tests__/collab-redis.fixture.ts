import {
  createConnection,
  createServer,
  type Server as NetServer,
  type Socket,
} from 'node:net';

import { Redis as RedisExtension } from '@hocuspocus/extension-redis';
import type { Hocuspocus } from '@hocuspocus/server';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import IORedis from 'ioredis';

import type { EnvConfig } from '../../../config/env.config';
import { HocuspocusAuthExtension } from '../extensions/hocuspocus-auth.extension';
import { HocuspocusPersistenceExtension } from '../extensions/hocuspocus-persistence.extension';
import { HocuspocusService } from '../hocuspocus.service';

const COLLAB_CHANNEL_PREFIX = 'knowtis-collab';

export function documentChannel(documentName: string): string {
  return `${COLLAB_CHANNEL_PREFIX}:${documentName}`;
}

/** Boots the real service against `redisUrl`, with the non-Redis extensions stubbed. */
export function buildCollaborationService(redisUrl: string): HocuspocusService {
  return new HocuspocusService(
    {
      guardHooks: () => ({}),
      toExtension: () => ({ priority: 100 }),
    } as unknown as HocuspocusAuthExtension,
    {
      toExtension: () => ({ priority: 1000 }),
    } as unknown as HocuspocusPersistenceExtension,
    new ConfigService({ REDIS_URL: redisUrl }) as ConfigService<
      EnvConfig,
      true
    >,
    { httpAdapter: undefined } as unknown as HttpAdapterHost
  );
}

/** The registered Redis extension, so a spec can drive its real hooks and clients. */
export function redisExtensionOf(service: HocuspocusService): RedisExtension {
  const { extensions } = (
    service as unknown as {
      server: { hocuspocus: { configuration: { extensions: unknown[] } } };
    }
  ).server.hocuspocus.configuration;
  const extension = extensions.find(
    (candidate) => candidate instanceof RedisExtension
  );
  if (!(extension instanceof RedisExtension)) {
    throw new Error('Redis extension was not registered');
  }
  return extension;
}

/** The live Hocuspocus instance, so a spec can load documents the way production does. */
export function hocuspocusOf(service: HocuspocusService): Hocuspocus {
  return (service as unknown as { server: { hocuspocus: Hocuspocus } }).server
    .hocuspocus;
}

/**
 * A TCP proxy to `upstreamUrl` that can refuse connections on demand, keeping its
 * port across restarts so a client reconnects to the same address.
 */
export async function createRedisOutage(upstreamUrl: string) {
  const upstream = new URL(upstreamUrl);
  const host = upstream.hostname;
  const port = Number(upstream.port || 6379);
  const sockets = new Set<Socket>();
  let listener: NetServer | null = null;
  let localPort = 0;

  const start = async (): Promise<void> => {
    if (listener) {
      return;
    }
    const server = createServer((downstream) => {
      const forward = createConnection({ host, port });
      for (const socket of [downstream, forward]) {
        sockets.add(socket);
        socket.on('error', () => undefined);
        socket.on('close', () => {
          sockets.delete(socket);
          downstream.destroy();
          forward.destroy();
        });
      }
      downstream.pipe(forward);
      forward.pipe(downstream);
    });
    await new Promise<void>((resolve) =>
      server.listen(localPort, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected outage proxy TCP port');
    }
    localPort = address.port;
    listener = server;
  };

  const stop = async (): Promise<void> => {
    for (const socket of sockets) {
      socket.destroy();
    }
    sockets.clear();
    const server = listener;
    listener = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };

  await start();
  const url = new URL(upstreamUrl);
  url.hostname = '127.0.0.1';
  url.port = String(localPort);
  return { url: url.toString(), start, stop };
}

/**
 * A Redis subscriber outside the service, connected straight to `upstreamUrl`, so a
 * spec can gate on an update having actually reached Redis instead of sleeping.
 */
export async function createCollabPublishObserver(upstreamUrl: string) {
  const client = new IORedis(upstreamUrl);
  const counts = new Map<string, number>();
  client.on('message', (channel: string) => {
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
  });

  return {
    watch: async (documentName: string) => {
      await client.subscribe(documentChannel(documentName));
    },
    publishCount: (documentName: string) =>
      counts.get(documentChannel(documentName)) ?? 0,
    stop: async () => {
      await client.quit().catch(() => undefined);
      client.disconnect();
    },
  };
}
