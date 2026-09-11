import type { EventEmitter } from 'node:events';
import type { Server } from 'node:http';

import { log } from './middleware/logger.js';

export const SHUTDOWN_TIMEOUT_MS = 8_000;

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];
type DrainOutcome = 'drained' | 'forced';

interface GracefulShutdownOptions {
  server: Server;
  signals: EventEmitter;
  timeoutMs: number;
  exit: (code: number) => void;
}

export function registerGracefulShutdown({
  server,
  signals,
  timeoutMs,
  exit,
}: GracefulShutdownOptions): void {
  let draining = false;

  server.on('request', (_req, res) => {
    if (draining) {
      res.setHeader('Connection', 'close');
    }
    res.once('close', () => {
      if (draining) {
        server.closeIdleConnections();
      }
    });
  });

  const shutdown = async (signal: ShutdownSignal) => {
    if (draining) {
      return;
    }
    draining = true;
    const startedAt = Date.now();
    log({ level: 'info', event: 'server_shutdown', signal, timeoutMs });
    const outcome = await drain(server, timeoutMs);
    log({
      level: 'info',
      event: 'server_stopped',
      outcome,
      durationMs: Date.now() - startedAt,
    });
    exit(0);
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    signals.on(signal, () => {
      shutdown(signal).catch(() => exit(0));
    });
  }
}

function drain(server: Server, timeoutMs: number): Promise<DrainOutcome> {
  return new Promise((resolve) => {
    const forceClose = setTimeout(() => {
      server.closeAllConnections();
      resolve('forced');
    }, timeoutMs);
    server.close(() => {
      clearTimeout(forceClose);
      resolve('drained');
    });
  });
}
