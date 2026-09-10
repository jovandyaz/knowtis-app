import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DB_AVAILABLE } from '../../../test-support/database';
import {
  AccessProtocolProbe,
  gate,
  ProbeAuthority,
  required,
  until,
  write,
} from './access-protocol.fixture';

describe.runIf(DB_AVAILABLE)(
  'active sharing access protocol (real PostgreSQL and Hocuspocus)',
  () => {
    let authority: ProbeAuthority;
    const probes: AccessProtocolProbe[] = [];
    const checkpoints: ReturnType<typeof gate>[] = [];

    function checkpoint() {
      const control = gate();
      checkpoints.push(control);
      return control;
    }

    async function start(
      options: ConstructorParameters<typeof AccessProtocolProbe>[1] = {}
    ) {
      const probe = new AccessProtocolProbe(authority, options);
      probes.push(probe);
      await probe.start();
      return probe;
    }

    beforeEach(async () => {
      authority = new ProbeAuthority();
      await authority.start();
    });
    afterEach(async () => {
      for (const control of checkpoints.splice(0)) {
        control.release();
      }
      const stopped = await Promise.allSettled(
        probes.splice(0).map((probe) => probe.stop())
      );
      await authority?.stop();
      const failed = stopped.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected'
      );
      if (failed) {
        throw failed.reason;
      }
    });

    it('characterizes handshake-only access: revoked clients still write and receive content', async () => {
      const probe = await start({ handshakeOnly: true });
      const guest = probe.connect('guest');
      const owner = probe.connect('owner');
      await Promise.all([probe.ready(guest), probe.ready(owner)]);
      await authority.setAccess('guest', 'none');
      write(guest, 'accepted-after-revocation');
      await until(() =>
        owner.provider.document
          .getMap('content')
          .has('accepted-after-revocation')
      );
      write(owner, 'disclosed-after-revocation');
      await until(() =>
        guest.provider.document
          .getMap('content')
          .has('disclosed-after-revocation')
      );
      expect(probe.sessions.size).toBe(2);
    });

    it('enforces viewer access against actual Yjs updates from a client ignoring its UI', async () => {
      await authority.setAccess('guest', 'viewer');
      const probe = await start();
      const guest = probe.connect('guest');
      const owner = probe.connect('owner');
      await Promise.all([probe.ready(guest), probe.ready(owner)]);
      write(guest, 'forbidden');
      write(owner, 'permitted');
      await until(() =>
        guest.provider.document.getMap('content').has('permitted')
      );
      await delay(100);
      expect(
        probe.server.hocuspocus.documents
          .get(probe.documentName)
          ?.getMap('content')
          .has('forbidden')
      ).toBe(false);
      expect(owner.provider.document.getMap('content').has('forbidden')).toBe(
        false
      );
      expect(
        probe.accepted.filter(({ identity }) => identity === 'guest')
      ).toHaveLength(0);
    });

    it('removes revoked access within five seconds without any invalidation message', async () => {
      const probe = await start();
      const guest = probe.connect('guest');
      const owner = probe.connect('owner');
      await Promise.all([probe.ready(guest), probe.ready(owner)]);
      write(guest, 'before');
      await until(() =>
        owner.provider.document.getMap('content').has('before')
      );
      const mutationStartedAt = await authority.setAccess('guest', 'none');
      await until(() =>
        probe.removed.some(({ identity }) => identity === 'guest')
      );
      expect(
        required(probe.removed.find(({ identity }) => identity === 'guest'))
          .at - mutationStartedAt
      ).toBeLessThanOrEqual(5_000);
      write(guest, 'forbidden');
      write(owner, 'secret');
      await delay(150);
      expect(owner.provider.document.getMap('content').has('forbidden')).toBe(
        false
      );
      expect(guest.provider.document.getMap('content').has('secret')).toBe(
        false
      );
    }, 10_000);

    it('rejects updates queued while a handshake permission is downgraded during document load', async () => {
      const probe = await start();
      const loading = checkpoint();
      let loadStarted = false;
      probe.beforeLoad = async () => {
        loadStarted = true;
        await loading.promise;
      };
      const guest = probe.connect('guest');
      write(guest, 'queued-handshake-write');
      await until(() => loadStarted);
      const session = required([...probe.sessions][0]);
      try {
        await authority.setAccess('guest', 'viewer');
        await until(() => session.access === 'viewer' || session.closed);
      } finally {
        loading.release();
      }
      await until(() => guest.provider.synced || session.closed);
      await delay(100);
      expect(
        probe.accepted.filter(({ identity }) => identity === 'guest')
      ).toHaveLength(0);
    });

    it('expires a handshake blocked on a stale database response without accepting its queued update', async () => {
      const probe = await start();
      const stale = checkpoint();
      let reading = false;
      authority.afterRead = async (identity) => {
        if (identity === 'guest') {
          reading = true;
          await stale.promise;
        }
      };
      const guest = probe.connect('guest');
      write(guest, 'stale-handshake-write');
      await until(() => reading);
      await authority.setAccess('guest', 'none');
      try {
        await until(() => guest.failures.length > 0);
      } finally {
        stale.release();
      }
      await delay(100);
      expect(guest.provider.synced).toBe(false);
      expect(probe.sessions.size).toBe(0);
      expect(probe.accepted).toHaveLength(0);
    });

    it('rejects a queued update when its permission expires while the message hook is pending', async () => {
      const probe = await start();
      const guest = probe.connect('guest');
      const owner = probe.connect('owner');
      await Promise.all([probe.ready(guest), probe.ready(owner)]);
      const pending = checkpoint();
      let entered = false;
      probe.beforeMessage = async (identity) => {
        if (identity === 'guest') {
          entered = true;
          await pending.promise;
        }
      };
      write(guest, 'pending-write');
      await until(() => entered);
      await authority.setAccess('guest', 'none');
      try {
        await until(() =>
          probe.removed.some(({ identity }) => identity === 'guest')
        );
      } finally {
        pending.release();
      }
      write(owner, 'post-close-content');
      await delay(100);
      expect(
        owner.provider.document.getMap('content').has('pending-write')
      ).toBe(false);
      expect(
        guest.provider.document.getMap('content').has('post-close-content')
      ).toBe(false);
    });

    it('fails closed on a real PostgreSQL read error', async () => {
      const probe = await start();
      const guest = probe.connect('guest');
      await probe.ready(guest);
      const failedAt = performance.now();
      await authority.admin`alter table ${authority.admin(authority.table)} rename column access to unavailable`;
      await until(() =>
        probe.removed.some(({ identity }) => identity === 'guest')
      );
      const removed = required(
        probe.removed.find(({ identity }) => identity === 'guest')
      );
      expect(removed.reason).toBe('Access unavailable');
      expect(removed.at - failedAt).toBeLessThanOrEqual(2_000);
      expect(probe.sessions.size).toBe(0);
    });

    it('fails closed when a real PostgreSQL lock prevents an authoritative read completing', async () => {
      const probe = await start();
      const guest = probe.connect('guest');
      await probe.ready(guest);
      const locked = checkpoint();
      const unlock = checkpoint();
      const transaction = authority.admin.begin(async (sql) => {
        await sql`lock table ${sql(authority.table)} in access exclusive mode`;
        locked.release();
        await unlock.promise;
      });
      await Promise.race([
        locked.promise,
        transaction.then(() => {
          throw new Error('Lock transaction ended before fault observation');
        }),
      ]);
      const blockedAt = performance.now();
      try {
        await until(() =>
          probe.removed.some(({ identity }) => identity === 'guest')
        );
        expect(
          required(probe.removed.find(({ identity }) => identity === 'guest'))
            .at - blockedAt
        ).toBeLessThanOrEqual(2_100);
      } finally {
        unlock.release();
        await transaction;
      }
      await delay(100);
      expect(probe.sessions.size).toBe(0);
      expect(probe.accepted).toHaveLength(0);
    });

    it('reconnects a downgraded client as a reader and rejects a subsequently revoked identity', async () => {
      const probe = await start();
      const guest = probe.connect('guest');
      const owner = probe.connect('owner');
      await Promise.all([probe.ready(guest), probe.ready(owner)]);
      await authority.setAccess('guest', 'viewer');
      await until(() =>
        probe.removed.some(({ identity }) => identity === 'guest')
      );
      const viewer = probe.connect('guest');
      await probe.ready(viewer);
      write(viewer, 'forbidden-after-reconnect');
      write(owner, 'viewer-visible');
      await until(() =>
        viewer.provider.document.getMap('content').has('viewer-visible')
      );
      expect(
        owner.provider.document
          .getMap('content')
          .has('forbidden-after-reconnect')
      ).toBe(false);
      await authority.setAccess('guest', 'none');
      const denied = probe.connect('guest');
      await until(() => denied.failures.length > 0);
      expect(denied.provider.synced).toBe(false);
      expect(denied.received).toHaveLength(0);
    });

    it('anchors a delayed permission renewal to the read start rather than its completion', async () => {
      const probe = await start();
      const guest = probe.connect('guest');
      await probe.ready(guest);
      const stale = checkpoint();
      let readAt = 0;
      authority.afterRead = async (identity) => {
        if (identity === 'guest' && readAt === 0) {
          readAt = performance.now();
          await stale.promise;
        }
      };
      await until(() => readAt > 0);
      const session = required([...probe.sessions][0]);
      const oldExpiry = session.expiresAt;
      await authority.setAccess('guest', 'none');
      await delay(300);
      const completedAt = performance.now();
      stale.release();
      await until(() => session.expiresAt !== oldExpiry);
      expect(session.expiresAt).toBeLessThanOrEqual(readAt + 2_000);
      expect(session.expiresAt).toBeLessThan(completedAt + 1_800);
      await until(() => session.closed);
    });

    describe.runIf(!!process.env['SHARING_PROBE_REDIS_URL'])(
      'two real servers with Redis document propagation',
      () => {
        async function pair() {
          const options = {
            redisUrl: required(process.env['SHARING_PROBE_REDIS_URL']),
            namespace: randomUUID(),
          };
          const left = await start(options);
          const right = await start(options);
          const guests = [left.connect('guest'), right.connect('guest')];
          const owner = left.connect('owner');
          await Promise.all([
            left.ready(required(guests[0])),
            right.ready(required(guests[1])),
            left.ready(owner),
          ]);
          write(owner, 'cross-server-before');
          await until(() =>
            guests.every((guest) =>
              guest.provider.document
                .getMap('content')
                .has('cross-server-before')
            )
          );
          return { left, right, guests, owner };
        }

        it.each(['delivered', 'lost', 'reconnected'] as const)(
          'bounds accepted updates and received broadcasts after revocation with invalidation %s',
          async (notification) => {
            const { left, right, guests, owner } = await pair();
            if (notification === 'lost') {
              await Promise.all([
                required(left.subscription).unsubscribe(left.channel),
                required(right.subscription).unsubscribe(right.channel),
              ]);
            } else if (notification === 'reconnected') {
              required(left.subscription).disconnect(false);
              required(right.subscription).disconnect(false);
            }
            let sequence = 0;
            const traffic = setInterval(() => {
              write(owner, `broadcast-${sequence}`);
              guests.forEach((guest, index) => {
                write(guest, `guest-${index}-${sequence}`);
              });
              sequence++;
            }, 20);
            try {
              const queriesBefore = authority.queries;
              const mutationStartedAt = await authority.setAccess(
                'guest',
                'none'
              );
              await left.publish();
              if (notification === 'reconnected') {
                await Promise.all([
                  required(left.subscription).connect(),
                  required(right.subscription).connect(),
                ]);
              }
              await until(() =>
                [left, right].every((probe) =>
                  probe.removed.some(({ identity }) => identity === 'guest')
                )
              );
              await delay(150);
              const removed = [left, right].map((probe) =>
                required(
                  probe.removed.find(({ identity }) => identity === 'guest')
                )
              );
              const accepted = [left, right].flatMap((probe) =>
                probe.accepted.filter(({ identity }) => identity === 'guest')
              );
              const received = guests.flatMap((guest) => guest.received);
              expect(
                Math.max(...removed.map(({ at }) => at)) - mutationStartedAt
              ).toBeLessThanOrEqual(5_000);
              expect(
                Math.max(...accepted.map(({ at }) => at), mutationStartedAt) -
                  mutationStartedAt
              ).toBeLessThanOrEqual(5_000);
              expect(
                accepted.every(({ at, expiresAt }) => at < expiresAt)
              ).toBe(true);
              expect(
                Math.max(...received, mutationStartedAt) - mutationStartedAt
              ).toBeLessThanOrEqual(5_000);
              write(owner, 'after-removal-secret');
              guests.forEach((guest) => {
                write(guest, 'after-removal-forbidden');
              });
              await delay(100);
              expect(
                guests.every(
                  (guest) =>
                    !guest.provider.document
                      .getMap('content')
                      .has('after-removal-secret')
                )
              ).toBe(true);
              expect(
                owner.provider.document
                  .getMap('content')
                  .has('after-removal-forbidden')
              ).toBe(false);
              console.warn(
                'sharing-probe-metric',
                JSON.stringify({
                  notification,
                  closeMs: Math.round(
                    Math.max(...removed.map(({ at }) => at)) - mutationStartedAt
                  ),
                  lastAcceptedMs: Math.round(
                    Math.max(
                      ...accepted.map(({ at }) => at),
                      mutationStartedAt
                    ) - mutationStartedAt
                  ),
                  lastReceivedMs: Math.round(
                    Math.max(...received, mutationStartedAt) - mutationStartedAt
                  ),
                  queries: authority.queries - queriesBefore,
                })
              );
            } finally {
              clearInterval(traffic);
            }
          },
          10_000
        );

        it.each(['error', 'blocked'] as const)(
          'bounds two-server traffic during a real PostgreSQL %s and does not revive removed sessions on recovery',
          async (fault) => {
            const { left, right, guests, owner } = await pair();
            const servers = [left, right];
            const sessions = servers.flatMap((probe) => [...probe.sessions]);
            const locked = checkpoint();
            const unlock = checkpoint();
            let transaction: Promise<unknown> | undefined;
            let renamed = false;
            let completedReads = 0;
            authority.afterRead = async () => {
              completedReads++;
            };
            let sequence = 0;
            const traffic = setInterval(() => {
              write(owner, `fault-broadcast-${sequence}`);
              guests.forEach((guest, index) => {
                write(guest, `fault-guest-${index}-${sequence}`);
              });
              sequence++;
            }, 20);
            try {
              await until(
                () =>
                  servers.every((probe) =>
                    probe.accepted.some(({ identity }) => identity === 'guest')
                  ) &&
                  guests.every((guest) =>
                    guest.provider.document
                      .getMap('content')
                      .has('fault-broadcast-0')
                  )
              );
              const queriesBefore = authority.queries;
              const completedBefore = completedReads;
              const faultStartedAt = performance.now();
              if (fault === 'error') {
                await authority.admin`alter table ${authority.admin(authority.table)} rename column access to unavailable`;
                renamed = true;
              } else {
                transaction = authority.admin.begin(async (sql) => {
                  await sql`lock table ${sql(authority.table)} in access exclusive mode`;
                  locked.release();
                  await unlock.promise;
                });
                await Promise.race([
                  locked.promise,
                  transaction.then(() => {
                    throw new Error(
                      'Lock transaction ended before fault observation'
                    );
                  }),
                ]);
              }
              await until(() =>
                servers.every((probe) =>
                  probe.removed.some(({ identity }) => identity === 'guest')
                )
              );
              await delay(150);
              const removed = servers.map((probe) =>
                required(
                  probe.removed.find(({ identity }) => identity === 'guest')
                )
              );
              const accepted = servers.flatMap((probe) =>
                probe.accepted.filter(({ identity }) => identity === 'guest')
              );
              const received = guests.flatMap((guest) => guest.received);
              expect(authority.queries - queriesBefore).toBeGreaterThanOrEqual(
                2
              );
              expect(accepted.some(({ at }) => at > faultStartedAt)).toBe(true);
              expect(received.some((at) => at > faultStartedAt)).toBe(true);
              expect(
                Math.max(...removed.map(({ at }) => at)) - faultStartedAt
              ).toBeLessThanOrEqual(5_000);
              expect(
                Math.max(...accepted.map(({ at }) => at)) - faultStartedAt
              ).toBeLessThanOrEqual(5_000);
              expect(
                Math.max(...received) - faultStartedAt
              ).toBeLessThanOrEqual(5_000);
              expect(
                accepted.every(({ at, expiresAt }) => at < expiresAt)
              ).toBe(true);
              servers.forEach((probe, index) => {
                expect(
                  probe.accepted.filter(
                    ({ identity, at }) =>
                      identity === 'guest' && at >= required(removed[index]).at
                  )
                ).toHaveLength(0);
              });
              const queriesDuringFault = authority.queries - queriesBefore;
              const acceptedCounts = servers.map(
                (probe) =>
                  probe.accepted.filter(({ identity }) => identity === 'guest')
                    .length
              );
              const receiptCounts = guests.map(
                (guest) => guest.received.length
              );
              const expiredPermissions = sessions.map(
                (session) => session.expiresAt
              );
              if (fault === 'error') {
                await authority.admin`alter table ${authority.admin(authority.table)} rename column unavailable to access`;
                renamed = false;
              } else {
                unlock.release();
                await transaction;
                await until(() => completedReads >= completedBefore + 3);
              }
              expect(await authority.read('guest')).toBe('editor');
              const recoveredOwner = left.connect('owner');
              const recoveredObserver = right.connect('owner');
              await Promise.all([
                left.ready(recoveredOwner),
                right.ready(recoveredObserver),
              ]);
              write(recoveredOwner, 'after-authority-recovery-secret');
              guests.forEach((guest, index) => {
                write(guest, `after-authority-recovery-forbidden-${index}`);
              });
              await until(() =>
                recoveredObserver.provider.document
                  .getMap('content')
                  .has('after-authority-recovery-secret')
              );
              await delay(150);
              expect(sessions.every((session) => session.closed)).toBe(true);
              expect(sessions.map((session) => session.expiresAt)).toEqual(
                expiredPermissions
              );
              expect(
                servers.map(
                  (probe) =>
                    probe.accepted.filter(
                      ({ identity }) => identity === 'guest'
                    ).length
                )
              ).toEqual(acceptedCounts);
              expect(guests.map((guest) => guest.received.length)).toEqual(
                receiptCounts
              );
              guests.forEach((guest, index) => {
                expect(
                  guest.provider.document
                    .getMap('content')
                    .has('after-authority-recovery-secret')
                ).toBe(false);
                expect(
                  recoveredOwner.provider.document
                    .getMap('content')
                    .has(`after-authority-recovery-forbidden-${index}`)
                ).toBe(false);
              });
              console.warn(
                'sharing-probe-fault-metric',
                JSON.stringify({
                  fault,
                  closeMs: Math.round(
                    Math.max(...removed.map(({ at }) => at)) - faultStartedAt
                  ),
                  lastAcceptedMs: Math.round(
                    Math.max(...accepted.map(({ at }) => at)) - faultStartedAt
                  ),
                  lastReceivedMs: Math.round(
                    Math.max(...received) - faultStartedAt
                  ),
                  queriesDuringFault,
                  revivedSessions: sessions.filter((session) => !session.closed)
                    .length,
                })
              );
            } finally {
              clearInterval(traffic);
              unlock.release();
              await transaction;
              if (renamed) {
                await authority.admin`alter table ${authority.admin(authority.table)} rename column unavailable to access`;
              }
            }
          },
          10_000
        );

        it('discards a stale read completing after invalidation and then re-reads authority', async () => {
          const left = await start({
            redisUrl: required(process.env['SHARING_PROBE_REDIS_URL']),
          });
          const guest = left.connect('guest');
          await left.ready(guest);
          const stale = checkpoint();
          let intercepted = false;
          authority.afterRead = async (identity) => {
            if (identity === 'guest' && !intercepted) {
              intercepted = true;
              await stale.promise;
            }
          };
          await left.publish();
          await until(() => intercepted);
          const session = required(
            [...left.sessions].find(
              (candidate) => candidate.identity === 'guest' && candidate.reading
            )
          );
          const oldExpiry = session.expiresAt;
          const previousGeneration = session.generation;
          await authority.setAccess('guest', 'none');
          await left.publish();
          try {
            await until(() => session.generation > previousGeneration);
          } finally {
            stale.release();
          }
          await until(() => session.closed);
          expect(session.expiresAt).toBe(oldExpiry);
          expect(left.sessions.size).toBe(0);
        });
      }
    );
  }
);
