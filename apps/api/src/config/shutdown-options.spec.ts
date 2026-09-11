import { once } from 'node:events';
import { connect, type AddressInfo, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';

import { Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, describe, expect, it } from 'vitest';

import { SHUTDOWN_OPTIONS } from './shutdown-options';

const CLOSE_DEADLINE_MS = 2_000;
const SWITCHING_PROTOCOLS =
  'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n';

@Injectable()
class FlushOnShutdown implements OnApplicationShutdown {
  flushed = false;

  onApplicationShutdown(): void {
    this.flushed = true;
  }
}

@Module({ providers: [FlushOnShutdown] })
class ShutdownProbeModule {}

async function openUnownedUpgrade(port: number): Promise<Socket> {
  const client = connect(port, '127.0.0.1');
  await once(client, 'connect');
  client.write(
    'GET /collaboration/doc HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
  );
  await once(client, 'data');
  return client;
}

async function closeWithin(
  closing: Promise<void>,
  deadlineMs: number
): Promise<'closed' | 'hung'> {
  let deadline: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      closing.then(() => 'closed' as const),
      new Promise<'hung'>((resolve) => {
        deadline = setTimeout(() => resolve('hung'), deadlineMs);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}

describe('SHUTDOWN_OPTIONS', () => {
  let app: NestExpressApplication | undefined;
  let closing: Promise<void> | undefined;
  let client: Socket | undefined;
  let upgraded: Duplex | undefined;

  afterEach(async () => {
    client?.destroy();
    upgraded?.destroy();
    await (closing ?? app?.close());
    app = undefined;
    closing = undefined;
    client = undefined;
    upgraded = undefined;
  });

  it('closes the app over an upgraded socket nobody closed and still runs the shutdown hooks', async () => {
    app = await NestFactory.create<NestExpressApplication>(
      ShutdownProbeModule,
      { ...SHUTDOWN_OPTIONS, logger: false }
    );
    app.getHttpServer().on('upgrade', (_request: unknown, socket: Duplex) => {
      upgraded = socket;
      socket.write(SWITCHING_PROTOCOLS);
    });
    const flush = app.get(FlushOnShutdown);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    client = await openUnownedUpgrade(port);
    const clientClosed = once(client, 'close');

    closing = app.close();
    await expect(closeWithin(closing, CLOSE_DEADLINE_MS)).resolves.toBe(
      'closed'
    );
    await clientClosed;
    expect(flush.flushed).toBe(true);
  });
});
