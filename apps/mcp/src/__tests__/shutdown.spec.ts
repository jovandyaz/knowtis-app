import { EventEmitter } from 'node:events';
import {
  Agent,
  createServer,
  request,
  type RequestListener,
  type Server,
} from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerGracefulShutdown, SHUTDOWN_SIGNALS } from '../shutdown.js';

const DRAIN_TIMEOUT_MS = 1_000;
const SHORT_DRAIN_TIMEOUT_MS = 200;
const KEEP_ALIVE_TIMEOUT_MS = 60_000;
const IN_FLIGHT_OBSERVATION_MS = 100;
const HOST = '127.0.0.1';
const CUT_RESPONSE = 'response cut before completion';

interface HttpResult {
  status: number;
  body: string;
}

const servers: Server[] = [];
const agents: Agent[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const agent of agents.splice(0)) {
    agent.destroy();
  }
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    if (server.listening) {
      server.close();
    }
  }
});

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function startServer(handler: RequestListener, timeoutMs: number) {
  const server = createServer(
    { keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS },
    handler
  );
  servers.push(server);
  const signals = new EventEmitter();
  const exited = deferred<number>();
  const exit = vi.fn((code: number) => exited.resolve(code));
  registerGracefulShutdown({ server, signals, timeoutMs, exit });
  await new Promise<void>((resolve) => server.listen(0, HOST, resolve));
  return { port: listeningPort(server), signals, exit, exited: exited.promise };
}

function listeningPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected the server to listen on a TCP port');
  }
  return address.port;
}

function holdResponses() {
  const received = deferred();
  const release = deferred();
  const handler: RequestListener = (_req, res) => {
    received.resolve();
    void release.promise.then(() => res.end('done'));
  };
  return { handler, received: received.promise, release: release.resolve };
}

function keepAliveAgent(): Agent {
  const agent = new Agent({ keepAlive: true });
  agents.push(agent);
  return agent;
}

function send(port: number, agent: Agent | false = false): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port, agent }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('close', () => {
        if (res.complete) {
          resolve({ status: res.statusCode ?? 0, body });
        } else {
          reject(new Error(CUT_RESPONSE));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function captureLogEvents(): () => Array<Record<string, unknown>> {
  const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  return () =>
    write.mock.calls
      .map(([chunk]) => String(chunk))
      .filter((line) => line.startsWith('{'))
      .map((line): Record<string, unknown> => JSON.parse(line));
}

describe('registerGracefulShutdown', () => {
  it.each(SHUTDOWN_SIGNALS)(
    'on %s stops listening and exits 0 without waiting for the timeout',
    async (signal) => {
      const events = captureLogEvents();
      const { port, signals, exited } = await startServer(
        (_req, res) => res.end('ok'),
        DRAIN_TIMEOUT_MS
      );
      await send(port, keepAliveAgent());

      signals.emit(signal);

      expect(await exited).toBe(0);
      expect(events()).toEqual([
        expect.objectContaining({
          level: 'info',
          event: 'server_shutdown',
          signal,
          timeoutMs: DRAIN_TIMEOUT_MS,
        }),
        expect.objectContaining({
          level: 'info',
          event: 'server_stopped',
          outcome: 'drained',
        }),
      ]);
      await expect(send(port)).rejects.toMatchObject({
        code: 'ECONNREFUSED',
      });
    }
  );

  it('lets an in-flight request finish on its keep-alive socket before exiting', async () => {
    const events = captureLogEvents();
    const { handler, received, release } = holdResponses();
    const { port, signals, exit, exited } = await startServer(
      handler,
      DRAIN_TIMEOUT_MS
    );
    const response = send(port, keepAliveAgent());
    await received;

    signals.emit('SIGTERM');
    await delay(IN_FLIGHT_OBSERVATION_MS);

    expect(exit).not.toHaveBeenCalled();

    release();

    await expect(response).resolves.toEqual({ status: 200, body: 'done' });
    expect(await exited).toBe(0);
    expect(events()).toEqual([
      expect.objectContaining({ event: 'server_shutdown' }),
      expect.objectContaining({ event: 'server_stopped', outcome: 'drained' }),
    ]);
  });

  it('force-closes a stream still open at the timeout and exits 0', async () => {
    const events = captureLogEvents();
    const received = deferred();
    const { port, signals, exited } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': open\n\n');
      received.resolve();
    }, SHORT_DRAIN_TIMEOUT_MS);
    const stream = expect(send(port, keepAliveAgent())).rejects.toThrow(
      CUT_RESPONSE
    );
    await received.promise;

    signals.emit('SIGTERM');

    expect(await exited).toBe(0);
    await stream;
    expect(events()).toEqual([
      expect.objectContaining({ event: 'server_shutdown' }),
      expect.objectContaining({ event: 'server_stopped', outcome: 'forced' }),
    ]);
  });

  it('runs the shutdown once when more signals arrive while it drains', async () => {
    const events = captureLogEvents();
    const { handler, received, release } = holdResponses();
    const { port, signals, exit, exited } = await startServer(
      handler,
      SHORT_DRAIN_TIMEOUT_MS
    );
    const response = send(port, keepAliveAgent());
    await received;

    signals.emit('SIGTERM');
    signals.emit('SIGINT');
    signals.emit('SIGTERM');
    release();
    await response;
    await exited;
    await delay(SHORT_DRAIN_TIMEOUT_MS);

    expect(exit).toHaveBeenCalledTimes(1);
    expect(events()).toEqual([
      expect.objectContaining({ event: 'server_shutdown', signal: 'SIGTERM' }),
      expect.objectContaining({ event: 'server_stopped', outcome: 'drained' }),
    ]);
  });
});
