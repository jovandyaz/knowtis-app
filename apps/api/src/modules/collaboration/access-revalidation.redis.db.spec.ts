import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { and, eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { COLLABORATION_CLOSE_REASON } from '@knowtis/shared-types';

import { notePermissions, notes } from '../../database/schema/notes.schema';
import {
  createSharingFixture,
  type SharingFixture,
} from '../notes/__tests__/sharing.fixture';
import {
  ActiveAccessServer,
  createAuthorityProxy,
  gate,
  required,
  until,
} from './__tests__/active-access.fixture';
import {
  ACCESS_INVALIDATION_CHANNEL,
  ACCESS_INVALIDATION_SUBSCRIBER_CONNECTION_NAME,
} from './access-invalidation.bus';

const CUTOFF_OBJECTIVE_MS = 5000;
const CUTOFF_GATE_MS = 10000;
const APPLY_CLOCK_SLACK_MS = 250;
const SUBSCRIBER_SETTLE_TIMEOUT_MS = 2000;
const SUBSCRIBER_SETTLE_POLL_MS = 50;

if (!process.env['DATABASE_URL'] || !process.env['REDIS_URL']) {
  throw new Error(
    'DATABASE_URL and REDIS_URL are required for active-access acceptance'
  );
}

describe('production access leases with PostgreSQL, Redis and real providers', () => {
  let f: SharingFixture;
  let servers: ActiveAccessServer[];
  let redis: Redis;
  beforeEach(async () => {
    f = await createSharingFixture();
    redis = new Redis(required(process.env['REDIS_URL']), {
      maxRetriesPerRequest: 1,
    });
    servers = [];
  });
  afterEach(async () => {
    const closed = await Promise.allSettled(
      servers.map((server) => server.close())
    );
    const cleanup = await Promise.allSettled([
      Promise.resolve().then(() => redis.disconnect()),
      f.close(),
    ]);
    const failures = [...closed, ...cleanup]
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length) {
      throw new AggregateError(
        failures,
        'Active access fixture cleanup failed'
      );
    }
  });
  async function server(authorityUrl?: string) {
    const instance = new ActiveAccessServer(f, [], authorityUrl);
    servers.push(instance);
    await instance.start();
    return instance;
  }
  async function listAccessInvalidationSubscriberIds() {
    const list = (await redis.client('LIST')) as string;
    return list
      .split('\n')
      .filter((line) =>
        line
          .split(' ')
          .includes(`name=${ACCESS_INVALIDATION_SUBSCRIBER_CONNECTION_NAME}`)
      )
      .map((line) => /id=(\d+)/.exec(line)?.[1])
      .filter(Boolean);
  }
  async function settledAccessInvalidationSubscriberIds(expected: number) {
    const startedAt = performance.now();
    let ids = await listAccessInvalidationSubscriberIds();
    while (
      ids.length !== expected &&
      performance.now() - startedAt < SUBSCRIBER_SETTLE_TIMEOUT_MS
    ) {
      await delay(SUBSCRIBER_SETTLE_POLL_MS);
      ids = await listAccessInvalidationSubscriberIds();
    }
    return ids;
  }
  async function revoke() {
    await f.db
      .delete(notePermissions)
      .where(
        and(
          eq(notePermissions.noteId, f.ids.note),
          eq(notePermissions.userId, f.ids.editor)
        )
      );
  }
  async function trafficPair(authorityUrl?: string) {
    const [a, b] = await Promise.all([
      server(authorityUrl),
      server(authorityUrl),
    ]);
    const owner = a.connect(f.ids.owner);
    const guests = [a.connect(f.ids.editor), b.connect(f.ids.editor)];
    await until(() => [owner, ...guests].every((c) => c.provider.synced));
    let i = 0;
    const traffic = setInterval(() => {
      owner.document.getMap('traffic').set('owner', ++i);
      guests.forEach((c, index) =>
        c.document.getMap('traffic').set(`guest-${index}`, i)
      );
    }, 20);
    await until(
      () =>
        guests.every((c) => c.receipts.length > 4) &&
        [a, b].every((s) => s.applied.some((e) => e.userId === f.ids.editor))
    );
    return { a, b, owner, guests, stop: () => clearInterval(traffic) };
  }
  async function assertCutoff(
    pair: Awaited<ReturnType<typeof trafficPair>>,
    started: number
  ) {
    const { a, b, guests } = pair;
    await until(() => guests.every((c) => c.closes.length > 0));
    await delay(200);
    const received = guests.map((c) => c.receipts.length);
    const accepted = [a, b].map(
      (s) => s.applied.filter((e) => e.userId === f.ids.editor).length
    );
    await delay(300);
    expect(guests.map((c) => c.receipts.length)).toEqual(received);
    expect(
      [a, b].map(
        (s) => s.applied.filter((e) => e.userId === f.ids.editor).length
      )
    ).toEqual(accepted);
    for (const instance of [a, b]) {
      expect(
        instance.applied.every((e) => e.authorizedAt < e.expiresAt && !e.closed)
      ).toBe(true);
      expect(
        instance.applied.every(
          (e) => e.at - e.authorizedAt < APPLY_CLOCK_SLACK_MS
        )
      ).toBe(true);
      expect(
        instance.leases
          .filter((l) => l.identity.userId === f.ids.editor)
          .every((l) => l.closed)
      ).toBe(true);
    }
    const last = Math.max(
      ...guests.flatMap((c) => [...c.receipts, ...c.closes.map((e) => e.at)]),
      ...[a, b].flatMap((s) =>
        s.applied.filter((e) => e.userId === f.ids.editor).map((e) => e.at)
      )
    );
    const cutoffMs = last - started;
    expect(cutoffMs).toBeLessThan(CUTOFF_GATE_MS);
    console.warn(
      JSON.stringify({
        scenario: expect.getState().currentTestName,
        cutoffMs: Math.round(cutoffMs),
        cutoffObjectiveMs: CUTOFF_OBJECTIVE_MS,
        withinObjective: cutoffMs < CUTOFF_OBJECTIVE_MS,
        diagnostics: [a.access.diagnostics, b.access.diagnostics],
      })
    );
  }

  it.each([
    'delivered',
    'lost',
    'subscriber-reconnected',
    'emitter-killed',
  ] as const)(
    'stops incoming and outgoing traffic when invalidation is %s',
    async (mode) => {
      const pair = await trafficPair();
      try {
        const started = performance.now();
        if (mode === 'emitter-killed') {
          const code = `const postgres = require('postgres'); const sql = postgres(process.env.DATABASE_URL); sql\`delete from note_permissions where note_id = \${process.env.S2_NOTE} and user_id = \${process.env.S2_USER}\`.then(() => process.kill(process.pid, 'SIGKILL'));`;
          const child = spawn(process.execPath, ['-e', code], {
            env: { ...process.env, S2_NOTE: f.ids.note, S2_USER: f.ids.editor },
            stdio: 'ignore',
          });
          await new Promise<void>((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (_code, signal) =>
              signal === 'SIGKILL'
                ? resolve()
                : reject(new Error('Emitter did not die after commit'))
            );
          });
        } else {
          await revoke();
        }
        if (mode === 'delivered') {
          await pair.a.bus.publish(f.ids.note);
        }
        if (mode === 'subscriber-reconnected') {
          const ids = await settledAccessInvalidationSubscriberIds(2);
          expect(ids).toHaveLength(2);
          await Promise.all(
            ids.map((id) => redis.client('KILL', 'ID', required(id)))
          );
        }
        await assertCutoff(pair, started);
        for (const c of pair.guests) {
          expect(c.closes[0]).toMatchObject({
            code: 1000,
            reason: COLLABORATION_CLOSE_REASON.ACCESS_CHANGED,
          });
        }
        const reconnect = pair.b.connect(f.ids.editor);
        await until(() => reconnect.failures.length > 0);
        expect(reconnect.failures[0]).toBe('Forbidden');
      } finally {
        pair.stop();
      }
    },
    15000
  );

  it('reauthenticates a direct downgrade once on the same provider and enforces readonly', async () => {
    const a = await server();
    const guest = a.connect(f.ids.editor);
    const owner = a.connect(f.ids.owner);
    await until(() => guest.provider.synced && owner.provider.synced);
    await f.db
      .update(notePermissions)
      .set({ permission: 'viewer' })
      .where(
        and(
          eq(notePermissions.noteId, f.ids.note),
          eq(notePermissions.userId, f.ids.editor)
        )
      );
    await a.access.invalidate(f.ids.note);
    await until(() => guest.closes.length > 0);
    await guest.provider.sendToken();
    await until(() => guest.scopes.length === 2);
    guest.provider.startSync();
    await until(() => guest.provider.synced);
    expect(guest.scopes).toEqual(['read-write', 'readonly']);
    guest.document.getMap('traffic').set('unauthorized-after-downgrade', true);
    owner.document.getMap('traffic').set('owner-after-downgrade', true);
    await until(() =>
      guest.document.getMap('traffic').has('owner-after-downgrade')
    );
    expect(
      owner.document.getMap('traffic').has('unauthorized-after-downgrade')
    ).toBe(false);
    await delay(300);
    const row = await f.db
      .select({ state: notes.yjsState })
      .from(notes)
      .where(eq(notes.id, f.ids.note));
    const stored = new Y.Doc();
    const state = row[0]?.state;
    if (!state) {
      throw new Error('Expected persisted Yjs state');
    }
    Y.applyUpdate(stored, state);
    expect(stored.getMap('traffic').has('unauthorized-after-downgrade')).toBe(
      false
    );
    stored.destroy();
  }, 15000);

  it.each(['link-downgrade', 'restricted', 'deleted'] as const)(
    'recalculates open link sessions after %s',
    async (mode) => {
      const a = await server();
      const guest = a.connect(f.ids.stranger, `s1-${f.ids.note}`);
      const owner = a.connect(f.ids.owner);
      await until(() => guest.provider.synced && owner.provider.synced);
      await f.db
        .update(notes)
        .set(
          mode === 'link-downgrade'
            ? { generalAccessPermission: 'viewer' }
            : mode === 'restricted'
              ? { generalAccess: 'restricted' }
              : { deletedAt: new Date() }
        )
        .where(eq(notes.id, f.ids.note));
      await a.access.invalidate(f.ids.note);
      await until(() => guest.closes.length > 0);
      expect(
        a.leases.find((l) => l.identity.userId === f.ids.owner)?.closed
      ).toBe(mode === 'deleted');
    }
  );

  it('preserves direct and owner capability through duplicate, stale and token-change invalidations', async () => {
    const a = await server();
    const owner = a.connect(f.ids.owner);
    const editor = a.connect(f.ids.editor, `s1-${f.ids.note}`);
    await until(() => owner.provider.synced && editor.provider.synced);
    await f.db
      .update(notes)
      .set({ shareToken: 'rotated-local', editorsCanShare: false })
      .where(eq(notes.id, f.ids.note));
    for (let i = 0; i < 30; i++) {
      await redis.publish(
        ACCESS_INVALIDATION_CHANNEL,
        JSON.stringify({ version: 1, noteId: f.ids.note })
      );
    }
    await delay(1200);
    expect(editor.closes).toHaveLength(0);
    expect(owner.closes).toHaveLength(0);
    expect(a.access.diagnostics.peakReads).toBe(1);
  });

  it('rejects a revoked pending handshake after deliberately slow shared hydration', async () => {
    const a = await server();
    const hold = gate();
    a.beforeLoad = () => hold.promise;
    const guest = a.connect(f.ids.editor);
    await until(() => a.access.diagnostics.activeNotes > 0);
    await delay(50);
    await revoke();
    await a.access.invalidate(f.ids.note);
    await delay(100);
    guest.document.getMap('traffic').set('queued-before-connect', true);
    hold.release();
    await until(() => guest.closes.length > 0);
    expect(a.applied.some((e) => e.userId === f.ids.editor)).toBe(false);
    expect(guest.provider.synced).toBe(false);
  });

  it.each(['sql-error', 'table-lock'] as const)(
    'cuts off sustained bidirectional traffic on %s and never revives expired sessions',
    async (mode) => {
      const pair = await trafficPair();
      const hold = gate();
      let lock: Promise<unknown> | undefined;
      try {
        const started = performance.now();
        if (mode === 'sql-error') {
          await f.client`alter table note_permissions rename to s2_unavailable_permissions`;
        } else {
          const locked = gate();
          lock = f.client.begin(async (sql) => {
            await sql`lock table note_permissions in access exclusive mode`;
            locked.release();
            await hold.promise;
          });
          await locked.promise;
        }
        await assertCutoff(pair, started);
        if (mode === 'sql-error') {
          await f.client`alter table s2_unavailable_permissions rename to note_permissions`;
        } else {
          hold.release();
          await lock;
        }
        const counts = pair.guests.map((c) => c.receipts.length);
        const fresh = pair.b.connect(f.ids.owner);
        await until(() => fresh.provider.synced);
        fresh.document.getMap('traffic').set('recovery', true);
        await delay(300);
        expect(pair.guests.map((c) => c.receipts.length)).toEqual(counts);
        expect(
          pair.a.leases
            .filter((l) => l.identity.userId === f.ids.editor)
            .every((l) => l.closed)
        ).toBe(true);
      } finally {
        pair.stop();
        hold.release();
        await lock;
        if (mode === 'sql-error') {
          await f.client`alter table if exists s2_unavailable_permissions rename to note_permissions`;
        }
      }
    },
    15000
  );
  it('bounds real SQL admission and expires a full queue under dedicated-pool saturation', async () => {
    const a = await server();
    const held = gate();
    const locked = gate();
    const lock = f.client.begin(async (sql) => {
      await sql`lock table note_permissions in access exclusive mode`;
      locked.release();
      await held.promise;
    });
    try {
      await locked.promise;
      const attempts = Array.from({ length: 100 }, () =>
        a.access
          .acquire(randomUUID(), {
            userId: f.ids.editor,
            suppliedTokenFingerprint: null,
          })
          .catch(() => null)
      );
      await delay(200);
      const activity =
        await f.client`select count(*)::int as count from pg_stat_activity where application_name = 'knowtis-access-authority' and wait_event_type = 'Lock'`;
      expect(activity[0]?.['count']).toBe(2);
      await delay(1100);
      expect(
        (await Promise.all(attempts)).every((result) => result === null)
      ).toBe(true);
      expect(a.access.diagnostics.peakReads).toBe(2);
      expect(a.access.diagnostics.peakQueuedNotes).toBe(64);
      expect(a.access.diagnostics.queuedNotes).toBe(0);
      expect(a.access.diagnostics.completedReads).toBeLessThanOrEqual(4);
      console.warn(
        JSON.stringify({
          scenario: 'pool-saturation',
          diagnostics: a.access.diagnostics,
        })
      );
    } finally {
      held.release();
      await lock;
    }
    await until(() => a.access.diagnostics.activeReads === 0);
    expect(a.access.diagnostics.activeNotes).toBe(0);
  }, 15000);

  it('retains admission through a stalled authority transport and recovers only new sessions', async () => {
    const proxy = await createAuthorityProxy(
      required(process.env['DATABASE_URL'])
    );
    const pair = await trafficPair(proxy.url);
    try {
      const started = performance.now();
      proxy.pause();
      await assertCutoff(pair, started);
      expect(pair.a.access.diagnostics.activeReads).toBe(1);
      expect(pair.b.access.diagnostics.activeReads).toBe(1);
      const received = pair.guests.map((c) => c.receipts.length);
      await delay(1500);
      expect(pair.a.access.diagnostics.activeReads).toBe(1);
      expect(pair.guests.map((c) => c.receipts.length)).toEqual(received);
      proxy.resume();
      await until(
        () =>
          pair.a.access.diagnostics.activeReads === 0 &&
          pair.b.access.diagnostics.activeReads === 0
      );
      const recovered = pair.b.connect(f.ids.owner);
      await until(() => recovered.provider.synced);
      recovered.document.getMap('traffic').set('transport-recovered', true);
      await delay(200);
      expect(pair.guests.map((c) => c.receipts.length)).toEqual(received);
      expect(
        pair.a.leases
          .filter((l) => l.identity.userId === f.ids.editor)
          .every((l) => l.closed)
      ).toBe(true);
    } finally {
      pair.stop();
      proxy.resume();
      await proxy.close();
    }
  }, 15000);

  it('retains valid link capability after direct revoke and restores direct viewer after token rotation', async () => {
    const a = await server();
    const editor = a.connect(f.ids.editor, `s1-${f.ids.note}`);
    const viewer = a.connect(f.ids.viewer, `s1-${f.ids.note}`);
    await until(() => editor.provider.synced && viewer.provider.synced);
    await revoke();
    await a.access.invalidate(f.ids.note);
    await delay(100);
    expect(editor.closes).toHaveLength(0);
    await f.db
      .update(notes)
      .set({ shareToken: 'another-local-token' })
      .where(eq(notes.id, f.ids.note));
    await a.access.invalidate(f.ids.note);
    await until(() => editor.closes.length > 0 && viewer.closes.length > 0);
    await viewer.provider.sendToken();
    await until(() => viewer.scopes.length === 2);
    expect(viewer.scopes[1]).toBe('readonly');
    viewer.provider.startSync();
    await until(() => viewer.provider.synced && a.leases.length === 3);
  });
  it('checks the lease after an awaited sync extension before applying queued content', async () => {
    const held = gate();
    const entered = gate();
    let slow = false;
    const a = new ActiveAccessServer(f, [
      {
        priority: 0,
        beforeSync: async ({ context }) => {
          if (slow && context.user.id === f.ids.editor) {
            entered.release();
            await held.promise;
          }
        },
      },
    ]);
    servers.push(a);
    await a.start();
    const guest = a.connect(f.ids.editor);
    const owner = a.connect(f.ids.owner);
    try {
      await until(() => guest.provider.synced && owner.provider.synced);
      slow = true;
      const before = a.applied.filter((e) => e.userId === f.ids.editor).length;
      guest.document.getMap('traffic').set('delayed-unauthorized', true);
      await entered.promise;
      await revoke();
      await a.access.invalidate(f.ids.note);
      await until(() => guest.closes.length > 0);
      held.release();
      await delay(100);
      expect(a.applied.filter((e) => e.userId === f.ids.editor)).toHaveLength(
        before
      );
      expect(owner.document.getMap('traffic').has('delayed-unauthorized')).toBe(
        false
      );
    } finally {
      held.release();
    }
  });

  it('expires a healthy-authority handshake when hydration exceeds its initial lease', async () => {
    const a = await server();
    const held = gate();
    a.beforeLoad = () => held.promise;
    const guest = a.connect(f.ids.editor);
    try {
      await until(() => a.access.diagnostics.activeNotes > 0);
      await until(() => a.access.diagnostics.activeNotes === 0);
      held.release();
      await until(() => guest.closes.length > 0);
      expect(guest.closes[0]?.reason).toBe(
        COLLABORATION_CLOSE_REASON.ACCESS_UNAVAILABLE
      );
      expect(guest.provider.synced).toBe(false);
      expect(a.applied).toHaveLength(0);
    } finally {
      held.release();
    }
  });
});
