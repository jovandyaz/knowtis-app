import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { Redis as HocuspocusRedis } from '@hocuspocus/extension-redis';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Server, type Connection, type Extension } from '@hocuspocus/server';
import Redis from 'ioredis';
import postgres from 'postgres';
import * as Y from 'yjs';

export type ProbeAccess = 'none' | 'viewer' | 'editor';

export interface ProbeSession {
  identity: string;
  access: ProbeAccess;
  expiresAt: number;
  closed: boolean;
  connection?: Connection<ProbeContext>;
  generation: number;
  reading: boolean;
  pending: boolean;
  expiry?: ReturnType<typeof setTimeout>;
  renewal?: ReturnType<typeof setInterval>;
}

interface ProbeContext {
  session: ProbeSession;
}

export interface ProbeClient {
  provider: HocuspocusProvider;
  received: number[];
  failures: string[];
  closes: string[];
}

export function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Test-only boundary delays occur after a real PostgreSQL snapshot has been read. */
export class ProbeAuthority {
  readonly table = `sharing_probe_${randomUUID().replaceAll('-', '')}`;
  readonly admin = postgres(required(process.env['DATABASE_URL']), { max: 1 });
  readonly reader = postgres(required(process.env['DATABASE_URL']), { max: 5 });
  queries = 0;
  afterRead?: (identity: string) => Promise<void>;

  async start() {
    await this
      .admin`create table ${this.admin(this.table)} (identity text primary key, access text not null)`;
    await this.setAccess('owner', 'editor');
    await this.setAccess('guest', 'editor');
  }

  async read(identity: string): Promise<ProbeAccess> {
    this.queries++;
    const rows = await this.reader<
      { access: ProbeAccess }[]
    >`select access from ${this.reader(this.table)} where identity = ${identity}`;
    await this.afterRead?.(identity);
    return rows[0]?.access ?? 'none';
  }

  async setAccess(identity: string, access: ProbeAccess) {
    const mutationStartedAt = performance.now();
    await this
      .admin`insert into ${this.admin(this.table)} (identity, access) values (${identity}, ${access}) on conflict (identity) do update set access = excluded.access`;
    return mutationStartedAt;
  }

  async stop() {
    await this.reader.end({ timeout: 0 });
    await this.admin`drop table ${this.admin(this.table)}`;
    await this.admin.end({ timeout: 0 });
  }
}

/** Disposable real Hocuspocus server; deliberately not registered in the Nest module. */
export class AccessProtocolProbe {
  readonly sessions = new Set<ProbeSession>();
  readonly clients: ProbeClient[] = [];
  readonly accepted: { identity: string; at: number; expiresAt: number }[] = [];
  readonly removed: { identity: string; at: number; reason: string }[] = [];
  readonly server: Server<ProbeContext>;
  readonly subscription?: Redis;
  readonly publisher?: Redis;
  readonly channel: string;
  readonly documentName: string;
  beforeMessage?: (identity: string) => Promise<void>;
  beforeLoad?: () => Promise<void>;

  constructor(
    readonly authority: ProbeAuthority,
    readonly options: {
      handshakeOnly?: boolean;
      redisUrl?: string;
      namespace?: string;
    } = {}
  ) {
    this.documentName = options.namespace ?? randomUUID();
    this.channel = `sharing-access:${this.documentName}`;
    const extensions: Extension<ProbeContext>[] = [this.accessExtension()];
    if (options.redisUrl) {
      const redisEndpoint = new URL(options.redisUrl);
      if (
        redisEndpoint.protocol !== 'redis:' ||
        redisEndpoint.username ||
        redisEndpoint.password ||
        !['', '/'].includes(redisEndpoint.pathname)
      ) {
        throw new Error(
          'The probe requires a disposable Redis URL without credentials or a database path'
        );
      }
      this.subscription = new Redis(options.redisUrl);
      this.publisher = new Redis(options.redisUrl);
      this.subscription.on('message', (_channel, payload) => {
        const message: unknown = JSON.parse(payload);
        if (
          typeof message === 'object' &&
          message !== null &&
          'version' in message &&
          message.version === 1 &&
          'noteId' in message &&
          message.noteId === this.documentName
        ) {
          this.invalidate();
        }
      });
      this.subscription.on('ready', () => {
        this.invalidate();
      });
      extensions.unshift(
        new HocuspocusRedis({
          host: redisEndpoint.hostname,
          port: Number(redisEndpoint.port || 6379),
          prefix: `sharing-doc:${this.documentName}`,
          disconnectDelay: 10,
        })
      );
    }
    this.server = new Server<ProbeContext>({
      port: 0,
      address: '127.0.0.1',
      quiet: true,
      stopOnSignals: false,
      debounce: 2_000,
      maxDebounce: 10_000,
      extensions,
      onLoadDocument: async ({ document }) => {
        await this.beforeLoad?.();
        document.on('update', (_update, transactionOrigin: unknown) => {
          if (
            typeof transactionOrigin === 'object' &&
            transactionOrigin !== null &&
            'connection' in transactionOrigin
          ) {
            const connection =
              transactionOrigin.connection as Connection<ProbeContext>;
            this.accepted.push({
              identity: connection.context.session.identity,
              at: performance.now(),
              expiresAt: connection.context.session.expiresAt,
            });
          }
        });
      },
    });
  }

  private accessExtension(): Extension<ProbeContext> {
    return {
      onAuthenticate: async ({ token, connectionConfig }) => {
        const session: ProbeSession = {
          identity: token,
          access: 'none',
          expiresAt: 0,
          closed: false,
          generation: 0,
          reading: false,
          pending: false,
        };
        this.sessions.add(session);
        if (this.options.handshakeOnly) {
          session.access = await this.authority.read(token);
          session.expiresAt = Infinity;
        } else {
          await this.refresh(session);
        }
        this.guard(session);
        connectionConfig.readOnly = session.access === 'viewer';
        if (!this.options.handshakeOnly) {
          session.renewal = setInterval(() => {
            void this.refresh(session);
          }, 1_000);
        }
        return { session };
      },
      connected: async ({ context, connection }) => {
        const { session } = context;
        session.connection = connection;
        connection.onClose((_document, event) => {
          this.finish(session);
          this.removed.push({
            identity: session.identity,
            at: performance.now(),
            reason: event?.reason ?? 'Disconnected',
          });
        });
        if (session.closed || performance.now() >= session.expiresAt) {
          this.close(session, 'Access expired');
        }
      },
      beforeHandleMessage: async ({ context }) => {
        this.guard(context.session);
        await this.beforeMessage?.(context.session.identity);
        this.guard(context.session);
      },
      beforeSync: async ({ context }) => {
        this.guard(context.session);
      },
    };
  }

  private guard(session: ProbeSession) {
    if (
      session.closed ||
      session.access === 'none' ||
      performance.now() >= session.expiresAt
    ) {
      this.close(session, 'Access expired');
      throw Object.assign(new Error('Access expired'), {
        code: 4403,
        reason: 'Access expired',
      });
    }
  }

  private finish(session: ProbeSession) {
    session.closed = true;
    clearTimeout(session.expiry);
    clearInterval(session.renewal);
    this.sessions.delete(session);
  }

  private close(session: ProbeSession, reason: string) {
    this.finish(session);
    session.connection?.close({ code: 4403, reason });
  }

  private async refresh(session: ProbeSession) {
    if (session.closed || this.options.handshakeOnly) {
      return;
    }
    if (session.reading) {
      session.pending = true;
      return;
    }
    session.reading = true;
    const startedAt = performance.now();
    const generation = session.generation;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const access = await Promise.race([
        this.authority.read(session.identity),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('Access read timed out'));
          }, 1_000);
        }),
      ]);
      if (session.closed || generation !== session.generation) {
        return;
      }
      if (
        access === 'none' ||
        (session.access !== 'none' && access !== session.access)
      ) {
        this.close(session, 'Access changed');
        return;
      }
      if (performance.now() >= startedAt + 2_000) {
        this.close(session, 'Access expired');
        return;
      }
      session.access = access;
      session.expiresAt = startedAt + 2_000;
      clearTimeout(session.expiry);
      session.expiry = setTimeout(
        () => {
          this.close(session, 'Access expired');
        },
        Math.max(0, session.expiresAt - performance.now())
      );
    } catch {
      this.close(session, 'Access unavailable');
    } finally {
      clearTimeout(timeout);
      session.reading = false;
      if (session.pending && !session.closed) {
        session.pending = false;
        void this.refresh(session);
      }
    }
  }

  private invalidate() {
    for (const session of this.sessions) {
      session.generation++;
      void this.refresh(session);
    }
  }

  async start() {
    await this.server.listen();
    await this.subscription?.subscribe(this.channel);
  }

  connect(identity: string): ProbeClient {
    const document = new Y.Doc();
    const received: number[] = [];
    const failures: string[] = [];
    const closes: string[] = [];
    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${this.server.address.port}`,
      name: this.documentName,
      token: identity,
      document,
      awareness: null,
      onAuthenticationFailed: ({ reason }) => {
        failures.push(reason);
      },
      onClose: ({ event }) => {
        closes.push(event.reason);
      },
    });
    document.on('update', (_update, origin) => {
      if (origin === provider) {
        received.push(performance.now());
      }
    });
    const client = { provider, received, failures, closes };
    this.clients.push(client);
    return client;
  }

  async ready(client: ProbeClient) {
    await until(() => client.provider.synced);
  }

  async publish() {
    await this.publisher?.publish(
      this.channel,
      JSON.stringify({ version: 1, noteId: this.documentName })
    );
  }

  async stop() {
    for (const session of this.sessions) {
      this.finish(session);
    }
    for (const { provider } of this.clients) {
      provider.destroy();
      provider.document.destroy();
    }
    await this.server.destroy();
    this.subscription?.disconnect(false);
    this.publisher?.disconnect(false);
  }
}

export async function until(condition: () => boolean, timeout = 5_000) {
  const deadline = performance.now() + timeout;
  while (!condition()) {
    if (performance.now() >= deadline) {
      throw new Error('Protocol observation timed out');
    }
    await delay(10);
  }
}

export function write(client: ProbeClient, key: string) {
  client.provider.document.getMap('content').set(key, true);
}

export function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Required probe observation or configuration is missing');
  }
  return value;
}
