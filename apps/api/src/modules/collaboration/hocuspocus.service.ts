import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { Redis as RedisExtension } from '@hocuspocus/extension-redis';
import { Server as HocuspocusServer } from '@hocuspocus/server';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../config/env.config';
import { HocuspocusAuthExtension } from './extensions/hocuspocus-auth.extension';
import { HocuspocusPersistenceExtension } from './extensions/hocuspocus-persistence.extension';

const COLLABORATION_PATH_PREFIX = '/collaboration';

@Injectable()
export class HocuspocusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HocuspocusService.name);
  private server!: HocuspocusServer;
  private upgradeHandler:
    | ((request: IncomingMessage, socket: Duplex, head: Buffer) => void)
    | null = null;
  private boundHttpServer: HttpServer | null = null;

  constructor(
    private readonly auth: HocuspocusAuthExtension,
    private readonly persistence: HocuspocusPersistenceExtension,
    private readonly config: ConfigService<EnvConfig, true>
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get('REDIS_URL', { infer: true });
    const redisExtensions = this.buildRedisExtensions(redisUrl);

    // Instantiate Hocuspocus' bundled Server. Its internal HTTP server is
    // never `listen()`'d — we forward 'upgrade' events from NestJS' HTTP
    // server so the WebSocket runs on the same port as the REST API.
    this.server = new HocuspocusServer({
      // Skip Hocuspocus' SIGINT/SIGTERM hook — NestJS owns process lifecycle.
      stopOnSignals: false,
      quiet: true,
      // Match the previous CollaborationService persistence cadence.
      debounce: 2000,
      maxDebounce: 10000,
      // Respect the debounce on disconnect so we don't clobber pending writes.
      unloadImmediately: false,
      extensions: [
        ...redisExtensions,
        this.auth.toExtension(),
        this.persistence.toExtension(),
      ],
    });

    this.logger.log('Hocuspocus initialized');
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.server) {
      return;
    }

    if (this.boundHttpServer && this.upgradeHandler) {
      this.boundHttpServer.off('upgrade', this.upgradeHandler);
      this.upgradeHandler = null;
      this.boundHttpServer = null;
    }

    try {
      // Force pending debounced onStoreDocument calls to run before tearing
      // down the server, otherwise in-flight edits may be lost on shutdown.
      this.server.hocuspocus.flushPendingStores();
    } catch (error) {
      this.logger.warn(
        'flushPendingStores failed on shutdown',
        error instanceof Error ? error.stack : error
      );
    }

    try {
      await this.server.destroy();
    } catch (error) {
      this.logger.error(
        'Hocuspocus shutdown failed',
        error instanceof Error ? error.stack : error
      );
    }
  }

  /**
   * Attach Hocuspocus to an existing Node HTTP server (the NestJS HTTP server).
   * We forward 'upgrade' events whose URL targets the collaboration path
   * prefix to Hocuspocus' internal HTTP server, where its crossws-based
   * upgrade handler is already wired.
   */
  attachToHttpServer(httpServer: HttpServer): void {
    if (!this.server) {
      throw new Error('HocuspocusService.onModuleInit must run before attach');
    }

    const hocuspocusHttpServer = this.server.httpServer;

    const upgradeHandler = (
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer
    ): void => {
      const url = request.url ?? '';
      if (!url.startsWith(COLLABORATION_PATH_PREFIX)) {
        // Defer to other upgrade handlers (e.g. socket.io for other gateways).
        return;
      }

      hocuspocusHttpServer.emit('upgrade', request, socket, head);
    };

    httpServer.on('upgrade', upgradeHandler);
    this.upgradeHandler = upgradeHandler;
    this.boundHttpServer = httpServer;

    this.logger.log(
      `Hocuspocus attached to HTTP server on path prefix ${COLLABORATION_PATH_PREFIX}`
    );
  }

  private buildRedisExtensions(redisUrl: string | undefined): RedisExtension[] {
    if (!redisUrl) {
      return [];
    }

    let parsed: URL;
    try {
      parsed = new URL(redisUrl);
    } catch (error) {
      this.logger.warn(
        `Invalid REDIS_URL, skipping Redis extension: ${
          error instanceof Error ? error.message : error
        }`
      );
      return [];
    }

    const port = parsed.port ? parseInt(parsed.port, 10) : 6379;

    return [
      new RedisExtension({
        host: parsed.hostname,
        port,
        prefix: 'knowtis-collab',
      }),
    ];
  }
}
