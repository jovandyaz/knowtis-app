import { setTimeout as delay } from 'node:timers/promises';

import { Redis as HocuspocusRedis } from '@hocuspocus/extension-redis';
import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  Server,
  type beforeHandleMessagePayload,
  type beforeSyncPayload,
  type Connection,
  type Extension,
} from '@hocuspocus/server';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as Y from 'yjs';

import type { SharingFixture } from '../../notes/__tests__/sharing.fixture';
import { AccessDatabase } from '../../notes/infrastructure/persistence/access-database';
import { DrizzleAccessSnapshotRepository } from '../../notes/infrastructure/persistence/drizzle-access-snapshot.repository';
import { DrizzleNoteRepository } from '../../notes/infrastructure/persistence/drizzle-note.repository';
import { UsersRepository } from '../../users/users.repository';
import { UsersService } from '../../users/users.service';
import { AccessInvalidationBus } from '../access-invalidation.bus';
import {
  AccessRevalidationService,
  type AccessLease,
} from '../access-revalidation.service';
import {
  HocuspocusAuthExtension,
  type HocuspocusAuthContext,
} from '../extensions/hocuspocus-auth.extension';
import { HocuspocusPersistenceExtension } from '../extensions/hocuspocus-persistence.extension';

export function required(value: string | undefined): string {
  if (!value) {
    throw new Error('Integration dependency URL is required');
  }
  return value;
}

export async function until(
  check: () => boolean,
  timeout = 5000
): Promise<void> {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeout) {
      throw new Error(`Condition not met within ${timeout}ms`);
    }
    await delay(10);
  }
}
export function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
interface ActiveAccessClient {
  provider: HocuspocusProvider;
  document: Y.Doc;
  receipts: number[];
  closes: { code: number; reason: string; at: number }[];
  failures: string[];
  scopes: string[];
}

export class ActiveAccessServer {
  readonly pool: AccessDatabase;
  readonly access: AccessRevalidationService;
  readonly bus: AccessInvalidationBus;
  readonly server: Server<HocuspocusAuthContext>;
  readonly leases: AccessLease[] = [];
  readonly applied: {
    userId: string;
    at: number;
    authorizedAt: number;
    expiresAt: number;
    closed: boolean;
  }[] = [];
  private readonly authorizedAt = new WeakMap<
    Connection<HocuspocusAuthContext>,
    number
  >();
  readonly jwt = new JwtService({
    secret: 'disposable-active-access-integration-secret',
    signOptions: { algorithm: 'HS256', expiresIn: '10m' },
  });
  readonly clients: ActiveAccessClient[] = [];
  beforeLoad?: () => Promise<void>;

  constructor(
    readonly fixture: SharingFixture,
    extraExtensions: Extension<HocuspocusAuthContext>[] = [],
    authorityUrl?: string
  ) {
    const config = new ConfigService({
      DATABASE_URL: authorityUrl ?? process.env['DATABASE_URL'],
      REDIS_URL: process.env['REDIS_URL'],
    });
    this.pool = new AccessDatabase(config);
    this.access = new AccessRevalidationService(
      new DrizzleAccessSnapshotRepository(this.pool.db)
    );
    this.bus = new AccessInvalidationBus(config, this.access);
    const auth = new HocuspocusAuthExtension(
      this.jwt,
      new UsersService(new UsersRepository(fixture.db)),
      this.access
    );
    const persistence = new HocuspocusPersistenceExtension(
      new DrizzleNoteRepository(fixture.db)
    );
    const redis = new URL(required(process.env['REDIS_URL']));
    const negative = process.env['SHARING_ACCESS_NEGATIVE_CONTROL'] === '1';
    if (!negative) {
      this.access.onModuleInit();
    }
    this.bus.onModuleInit();
    this.server = new Server<HocuspocusAuthContext>({
      port: 0,
      address: '127.0.0.1',
      quiet: true,
      stopOnSignals: false,
      debounce: 100,
      maxDebounce: 200,
      unloadImmediately: false,
      ...(negative ? {} : this.stampedGuardHooks(auth)),
      extensions: [
        new HocuspocusRedis({
          host: redis.hostname,
          port: Number(redis.port || 6379),
          prefix: `active-access:${fixture.ids.note}`,
          disconnectDelay: 10,
        }),
        auth.toExtension(),
        persistence.toExtension(),
        ...extraExtensions,
      ],
      onLoadDocument: async ({ document }) => {
        await this.beforeLoad?.();
        document.on('update', (_update, origin: unknown) => {
          if (
            typeof origin === 'object' &&
            origin !== null &&
            'connection' in origin
          ) {
            const connection =
              origin.connection as Connection<HocuspocusAuthContext>;
            const lease = connection.context.accessLease;
            this.applied.push({
              userId: lease.identity.userId,
              at: performance.now(),
              authorizedAt:
                this.authorizedAt.get(connection) ?? Number.POSITIVE_INFINITY,
              expiresAt: lease.expiresAt,
              closed: lease.closed,
            });
          }
        });
      },
      connected: async ({ context }) => {
        this.leases.push(context.accessLease);
      },
    });
  }

  private stampedGuardHooks(auth: HocuspocusAuthExtension) {
    const guards = auth.guardHooks();
    return {
      ...guards,
      beforeHandleMessage: async (
        payload: beforeHandleMessagePayload<HocuspocusAuthContext>
      ) => {
        await guards.beforeHandleMessage?.(payload);
        this.authorizedAt.set(payload.connection, performance.now());
      },
      beforeSync: async (payload: beforeSyncPayload<HocuspocusAuthContext>) => {
        await guards.beforeSync?.(payload);
        this.authorizedAt.set(payload.connection, performance.now());
      },
    };
  }

  async start() {
    await this.server.listen();
  }

  connect(userId: string, shareToken?: string): ActiveAccessClient {
    const document = new Y.Doc();
    const receipts: number[] = [];
    const closes: { code: number; reason: string; at: number }[] = [];
    const failures: string[] = [];
    const scopes: string[] = [];
    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${this.server.address.port}${shareToken ? `?shareToken=${encodeURIComponent(shareToken)}` : ''}`,
      name: this.fixture.ids.note,
      document,
      awareness: null,
      token: this.jwt.sign({ sub: userId }),
      onAuthenticationFailed: ({ reason }) => {
        failures.push(reason);
      },
      onAuthenticated: ({ scope }) => {
        scopes.push(scope);
      },
      onClose: ({ event }) => {
        closes.push({
          code: event.code,
          reason: event.reason,
          at: performance.now(),
        });
      },
    });
    document.on('update', (_update, origin) => {
      if (origin === provider) {
        receipts.push(performance.now());
      }
    });
    const client = { provider, document, receipts, closes, failures, scopes };
    this.clients.push(client);
    return client;
  }

  async close() {
    this.bus.onModuleDestroy();
    this.access.onModuleDestroy();
    for (const client of this.clients) {
      client.provider.destroy();
      client.document.destroy();
    }
    await Promise.all(this.server.hocuspocus.loadingDocuments.values());
    this.server.hocuspocus.closeConnections();
    this.server.hocuspocus.flushPendingStores();
    await until(
      () =>
        this.server.hocuspocus.documents.size === 0 &&
        this.server.hocuspocus.unloadingDocuments.size === 0
    );
    await this.server.destroy();
    await this.pool.onModuleDestroy();
  }
}

/** Owns only the authority sockets created by this fixture. */
export async function createAuthorityProxy(databaseUrl: string) {
  const { createServer, createConnection } = await import('node:net');
  const upstreamUrl = new URL(databaseUrl);
  const sockets = new Set<import('node:net').Socket>();
  let paused = false;
  const listener = createServer((downstream) => {
    const upstream = createConnection({
      host: upstreamUrl.hostname,
      port: Number(upstreamUrl.port || 5432),
    });
    for (const socket of [downstream, upstream]) {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => {
        sockets.delete(socket);
        downstream.destroy();
        upstream.destroy();
      });
    }
    downstream.pipe(upstream);
    upstream.pipe(downstream);
    if (paused) {
      downstream.pause();
      upstream.pause();
    }
  });
  await new Promise<void>((resolve) =>
    listener.listen(0, '127.0.0.1', resolve)
  );
  const address = listener.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected proxy TCP port');
  }
  const url = new URL(databaseUrl);
  url.hostname = '127.0.0.1';
  url.port = String(address.port);
  return {
    url: url.toString(),
    pause() {
      paused = true;
      for (const socket of sockets) {
        socket.pause();
      }
    },
    resume() {
      paused = false;
      for (const socket of sockets) {
        socket.resume();
      }
    },
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    },
  };
}
